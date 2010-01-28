/*
 * Application protocol module
 *
 */

#include <time.h>

#include <string>
#include <map>
#include <vector>
#include <string.h>

#include "data.h"
#include "garmin.h"
#include "gps.h"
#include "phys.h"
#include "endian.h"

using namespace std;

/* Convert semicircles to degrees */
static double semi2deg(int32_t semi)
{
    return (double) semi * (180.0 / 2147483648.0);
}
/* Convert GPS time to host time */
static time_t gps2hosttime(uint32_t gpstime)
{
    return 631065600 + gpstime;
}

/* Download tracklog from GPS */
PointArr GarminGps::download_tracklog(dt_callback cb, void *arg)
{
    if (proto_data.count(300))
	return A30xdownload(300, cb, arg);
    else if (proto_data.count(301))
	return A30xdownload(301, cb, arg);
    else if  (proto_data.count(302))
	return A30xdownload(302, cb, arg);
    
    throw Exception("Unsupported tracklog protocol.");
}

Trackpoint GarminGps::decode_trk_data(const Data &data, int dtype) 
{
    Trackpoint result;
    
/* Should be made more C++ like with classes, but don't bother now */
#define TPDEF(nm) D ##nm##_Trk_Point_Type *tp = (D ##nm##_Trk_Point_Type *)data.buffer
#define TPTRAN { result.lat = semi2deg(le32_to_host(tp->posn.lat));\
                 result.lon = semi2deg(le32_to_host(tp->posn.lon)); \
                 result.time = gps2hosttime(le32_to_host(tp->time)); \
               }
#define TALTSW(num) case num: {TPDEF(num);TPTRAN;result.gpsalt = tp->alt;break;}
#define TALTSWTR(num) case num: {TPDEF(num);TPTRAN;\
               result.gpsalt = float_to_host(tp->alt);\
               result.new_trk = tp->new_trk;\
               break; }

    result.new_trk = false;
    switch (dtype) {
    case 300: {
	TPDEF(300);
	TPTRAN;
	result.new_trk = tp->new_trk;
	break;
    }
	TALTSWTR(301);
	TALTSWTR(302);
	TALTSW(303);
	TALTSW(304);
    default:
	throw Exception("Unsupported track data type.");
    }
    // Don't return negative height, we don't fly under the sea level, do we?
    if (result.gpsalt < 0)
	result.gpsalt = 0;
    return result;
}

#if 0
void GarminGps::ChangeSpeed(uint32_t baudrate)
{
    uint16_t zero = 0;
    Data zdata((uint8_t *)&zero, sizeof(zero));
    phys->send_packet(Pid_Rqst_Data, zdata);

    Data data((uint8_t *)&baudrate, sizeof(baudrate));
    uint8_t pid;
    printf("Sending request\n");
    phys->send_packet(Pid_Speed_Request, data);

    phys->recv_packet(pid, data);
    if (pid == Pid_Speed_Answer) {
	baudrate = *( (uint32_t *)data.buffer);
	// GPS is stupid
	if (baudrate > 110000 && baudrate < 120000)
	    baudrate = 115200;
	else if (baudrate > 50000 && baudrate < 60000)
	    baudrate = 57600;
	else if (baudrate > 30000 && baudrate < 40000)
	    baudrate = 38400;
	else if (baudrate > 15000 && baudrate < 25000)
	    baudrate = 19200;
	else if (baudrate > 8000 && baudrate < 12000)
	    baudrate = 9600;
	struct timeval tm;
	tm.tv_sec = 0;
	tm.tv_usec = 100;
	select(0, NULL, NULL, NULL, &tm);

	printf("Setting to: %d\n", baudrate);
	phys->set_speed(baudrate);
	printf("Done\n");
	printf("Testing...\n");
	try { send_command(0x3a); } catch (Exception e) { printf("F1\n"); }
	try { send_command(0x3a); } catch (Exception e) { printf("F2\n"); }
	try { send_command(0x3a); } catch (Exception e) { printf("F3\n"); }
	printf("Done\n");
	sleep(2);
    }
    
}
#endif

/* Download tracklog using A300, A301 & A302 protocols */
PointArr GarminGps::A30xdownload(int proto, dt_callback cb, void *arg) 
{
    uint8_t pid = 0;
    Data data;
    PointArr result;
    uint16_t cmdid;
    Trackpoint point;
    int pktcount = 0;
    bool suspend = false; // If true, do not save trackpoints
    int dataproto = (proto == 300) ? 300 : proto_data[proto][1];
    
    send_command(Cmnd_Transfer_Trk);
    int exp_count = get_records();

    if (!exp_count) // No trackpoints expected
	return result;

    while (pid != Pid_Xfer_Complete) {
	phys->recv_packet(pid, data);

	if (cb) {
	    bool rv = cb(arg, pktcount, exp_count); 
	    if (!rv) { // Abort
		send_command(Cmnd_Abort_Transfer);
		throw Exception("Aborted.");
	    }
	}
	pktcount++;
	
	switch (pid) {
	case Pid_Trk_Hdr:
	    // if the protocol is not D310 || D312
	    if (proto_data[proto][0] != 310 && proto_data[proto][0] != 312)
		break;
	    // If we are "high version", download all tracklogs
	    if (gpsid >= NEW_VERSION)
		break;
	    // else throw out everything that is not 'active log'
	    if (!strncmp((const char *)&data.buffer[2], "ACTIVE LOG", data.size-2))
		suspend = false;
	    else
		suspend = true;
	    break;
	case Pid_Trk_Data:
	    if (!suspend) {
		point = decode_trk_data(data, dataproto);
		// If the point is older then the last point, discard the
		// last point
		if (gpsid < NEW_VERSION && result.size() && point.time < result[result.size() - 1].time)
		    result[result.size() - 1] = point;
		else
		    result.push_back(point);
	    }
	    break;
	case Pid_Xfer_Complete:
	    cmdid = le16_to_host(*((uint16_t *)data.buffer));
	    if (cmdid != Cmnd_Transfer_Trk)
		throw Exception("Bad command id on command completion.");
	    break;
	default:
	    throw Exception("Unexpected data packed.");
	}
    }

    return result;
}

/* Fetch unitid if the unit supports */
uint32_t GarminGps::get_unitid()
{
    Data data;

    send_command(Cmnd_Unitid);
    phys->expect_packet(Pid_Unit_ID, data);

    return *((uint32_t *)data.buffer);
}

/* Read GPS identification and supported protocols */
void GarminGps::init_gps() 
{
    Data data;

    phys->send_packet(Pid_Product_Rqst, "");
    phys->expect_packet(Pid_Product_Data, data);
	
    Product_Data_Type *product = (Product_Data_Type *)data.buffer;

    gpsid = le16_to_host(product->ID);
    gpsversion = le16_to_host(product->version);
    gpsname = product->description;

    Data ndata;
    try {
	phys->expect_packet(Pid_Protocol_Array, ndata);
	parse_proto(ndata);
    } catch (TimeoutException e) {
	/* Fall back on A300/D300 protocol */
	proto_data[300].push_back(300);
    } 
    /* Get unitid from map units */
    try {
	gpsunitid = get_unitid();
    } catch (Exception e) {
	// Fail back if gps does not accept get unitid
	gpsunitid = data.long_checksum() + ndata.long_checksum();
    }
}

/* Parse protocol_array structure and set appropriate identifications
 * of data structures to proto_data variable
 */
void GarminGps::parse_proto(const Data &data) 
{
    int proto = 0;
    for (uint8_t *buf = data.buffer;buf < data.buffer + data.size; buf+=3) {
	uint8_t tag = buf[0];
	uint16_t dtype = buf[2]*256 + buf[1];
	    
	if (tag == 'A') {
	    proto = dtype;
	}
	/* Set data type for protocol */
	if (tag == 'D') {
	    proto_data[proto].push_back(dtype);
	}
    }
}

/* Send command to GPS using Command data protocol */
void GarminGps::send_command(uint16_t command) {
    uint16_t cmdle = host_to_le16(command);
    phys->send_packet(Pid_Command_Data, 
		      Data((uint8_t *)&cmdle, sizeof(cmdle)));
}


/* Wait for Pid_Records & return expected packet count */
int GarminGps::get_records() {
    Data data;
    
    phys->expect_packet(Pid_Records, data);
    
    return *((uint16_t *)data.buffer);
}

