#include <string>
#include <sstream>
#include <iostream>
#include <time.h>
#include <stdio.h>

#include "aircotec.h"
#include "igc.h"

using namespace std;

#define BAUDRATE 57600

#define FLAG_FIX   0x1
#define FLAG_FIX3D 0x2

/* Maximum timeout in seconds for readline, during download */
#define DOWN_TIMEOUT 2

/* Read line from input & check the checksum */
/* Timeout specified in seconds, 0 means no timeout */
string AircotecGps::ac_readline(dt_callback cb, void *arg,
				int pktcount, int expcount,
				int timeout)
{
    time_t starttime = time(NULL);
  restart:
    if (timeout && time(NULL) - starttime > timeout)
	throw TimeoutException();

    string result;
    char ch;

    while (1) {
	if (cb) {
	    bool rv = cb(arg, pktcount, expcount);
	    if (!rv)
		throw Exception("Download cancelled");
	}
	try {
	    ch = dev->read();
	} catch (TimeoutException e) {
	    // TODO: Handle timeouts in some reasonable way
	    goto restart;
	} 

	if (ch == '\n')
	    break;
	if (ch == '\r')
	    continue;
	result += ch;
    }
    if (result.size() < 2)
	goto restart;

    string cksum_s = result.substr(result.size()-2);
    int cksum_wr;
    if (sscanf(cksum_s.c_str(), "%2X", &cksum_wr) != 1)
	goto restart;
    int cksum = 0;
    for (unsigned int i=0; i < result.size()-2; i++)
	cksum ^= result[i];

    if (cksum != cksum_wr)
	goto restart;
    
    return result;
}

void AircotecGps::get_header(dt_callback cb, void *arg, int &pointcount, time_t &basetime, enum aircotec_height &height_type)
{
    char devtype[5];
    int vermaj, vermin, verpatch;
    int flnum;
    struct tm tmv;
    int tmp1, interval, cksum;
    char cheight_type;

    /* Wait for the initial line */
    while(1) {
	string line = ac_readline(cb, arg, 0, 0, 0);
	/* parse */
	int np = sscanf(line.c_str(), "@%2s%1d%1d%2d%4X%2X%2d%2d%2d%2d%2d%2d%2d%4X%2X%c**%2X", 
			devtype, &vermaj, &vermin, &verpatch, &gpsunitid, &flnum, 
			&tmv.tm_year, &tmv.tm_mon, &tmv.tm_mday, &tmv.tm_hour, &tmv.tm_min, &tmv.tm_sec, 
			&tmp1, &pointcount, &interval, &cheight_type, &cksum);
	if (np != 17)
	    continue;
	break;
    }
    /* Make GPS name */
    stringstream sgps;
    sgps << "Aircotec ";
    if (string("xc") == devtype) {
	sgps << "XC-Trainer ";
	sgps << "v" << vermaj << '.' << vermin << '-' << verpatch;
    } else if (string("tn") == devtype) {
	sgps << "Top-navigator ";
	sgps << "v" << vermaj << '.' << vermin << hex << verpatch << dec;
    } else {
	sgps << "Unknown(" << devtype << ") ";
	sgps << "v" << vermaj << '.' << vermin << '-' << verpatch;
    }
    gpsname = sgps.str();

    /* Make starting time */
    tmv.tm_year += 100;
    tmv.tm_mon -= 1;
    basetime = make_gmtime(&tmv);
    
    if (cheight_type == '1')
	height_type = AIRCOTEC_GPS;
    else if (cheight_type == '2')
	height_type = AIRCOTEC_GPS_BARO;
    else
	height_type = AIRCOTEC_BARO;
}

PointArr AircotecGps::download_tracklog(dt_callback cb, void *arg)
{
    time_t basetime;
    int pointcount;
    enum aircotec_height height_type;

    /* Set the device to baudrate */
    dev->set_speed(BAUDRATE);

    try {
	get_header(cb, arg, pointcount, basetime, height_type);
    } catch (TimeoutException) {
	throw NoData("No data received.");
    }

    int32_t dlat, dlon;
    int dpos, dtime, fix, cksum;
    int16_t alt, alt2;
    PointArr result;
    /* Read the rest */
    for (int i = 0; i < pointcount; i++) {
	string line = ac_readline(cb, arg, i, pointcount, DOWN_TIMEOUT);
	int np;
	if (height_type == AIRCOTEC_GPS_BARO) {
	    np = sscanf(line.c_str(), "%4X%4X%2X%6X%6X%4hX%4hX%2X",
			    &dpos, &dtime, &fix, &dlat, &dlon, &alt, &alt2, &cksum);
	    if (np != 8) // Syntax error
		throw Exception("Incorrect data received.");
	} else {
	    np = sscanf(line.c_str(), "%4X%4X%2X%6X%6X%4hX%2X",
			    &dpos, &dtime, &fix, &dlat, &dlon, &alt, &cksum);
	    if (np != 7) // Syntax error
		throw Exception("Incorrect data received.");
	}

	if (dpos != i)
	    throw Exception("Incorrect position data received");

	// Skip points without fix. Maxpunkte saves it and
	// sets fix3d to false..
	if (! (fix & FLAG_FIX))
	    continue;

	Trackpoint newpoint;
	if (height_type == AIRCOTEC_GPS) {
	    newpoint.gpsalt = alt;
	} else if (height_type == AIRCOTEC_BARO) {
	    newpoint.baroalt = alt;
	} else {
	    newpoint.gpsalt = alt;
	    newpoint.baroalt = alt2;
	}
	newpoint.fix3d = true;
	newpoint.time = basetime + dtime;
	// Modify dlat & dlon to be proper negative numbers, if it is negative
	if (dlat & 0x800000) dlat |= 0xff000000;
	if (dlon & 0x800000) dlon |= 0xff000000;
	
	newpoint.lat = dlat / 24000.0;
	newpoint.lon = dlon / 24000.0;

	result.push_back(newpoint);
    }

    return result;
}
