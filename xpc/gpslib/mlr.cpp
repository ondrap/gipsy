#include <string>
#include <sstream>
#include <iostream>
#include <vector>
#include <algorithm>

#include <time.h>

#include "mlr.h"
#include "igc.h"
#include "data.h"

using namespace std;

void MLRGps::init_gps()
{
    dev->set_speed(4800);
    dev->settimeout(2);
    
    // Stop any previous command
    dev->write("$PMLR,06,00,02A9\r\n");
    // Read identification
    dev->write("$PMLR,26,01,01,0339\r\n");
    vector<string> result = receive_data("PMLR");
    gpsname = result[2];
    
    gpsunitid = 0;
    for (size_t i=0; i < result[4].size(); i++) {
        // Rotate, XOR
        unsigned char end = gpsunitid >> 24;
        gpsunitid <<= 8;
        gpsunitid += end ^ result[4][i];
    }
}

static int32_t make_int32(const uint8_t *buf)
{
    return (buf[0] << 24) | (buf[1] << 16) | (buf[2] << 8) | buf[3];
}

static int32_t make_int32_3(const uint8_t *buf)
{
    return (buf[0] << 16) | (buf[1] << 8) | buf[2];
}

static bool compare_time(const Trackpoint &first, const Trackpoint &second)
{
    return first.time < second.time;
}

PointArr MLRGps::download_tracklog(dt_callback cb, void *arg)
{
    dev->set_speed(4800);
    
    // Download 
    dev->write("$PMLR,24,02,0101,0399\r\n");
    // Wait 100ms before changing speed
#ifdef WIN32
    _sleep(400);
#else
    struct timeval tm;
    tm.tv_sec = 0;
    tm.tv_usec = 400000;
    select(0, NULL, NULL, NULL, &tm);
#endif
    
    dev->set_speed(38400);
    dev->settimeout(3);

    PointArr result;
    vector<Data> array;
    unsigned char snum;
    while (read_sentence(array, snum)) {
        if (cb) {
	    bool rv = cb(arg, snum, 256);
	    if (!rv)
		throw Exception("Download cancelled");
        }
        for (size_t i=0; i < array.size(); i++) {
            Trackpoint newpoint;
            
            newpoint.time = make_int32(array[i].buffer + 2) + 315964800;
            newpoint.lat = make_int32(array[i].buffer + 6) * 360.0 / 4294967296.0;
            newpoint.lon = make_int32(array[i].buffer + 10) * 360.0 / 4294967296.0;
            newpoint.gpsalt = make_int32_3(array[i].buffer + 14) / 10.0;
            newpoint.new_trk = array[i][17] ? true : false;
            result.push_back(newpoint);
        }
    }
    sort(result.begin(), result.end(), compare_time);
    return result;
}

bool MLRGps::read_sentence(vector<Data> &result, unsigned char &snum)
{
    Data data;
    result.clear();
    
    data += dev->read();
    if (data[-1] != 0x8b)
        throw Exception("Syntax error - 0x8b.");
    
    data += dev->read();
    snum = data[-1];
    
    data += dev->read();
    if (data[-1] != 'T')
        throw Exception("Syntax error - T.");
    
    data += dev->read();
    if (data[-1] != 1)
        throw Exception("Syntax error - 1");
    
    data += dev->read();
    if (data[-1] != 0) {
        data += dev->read();
        data += dev->read();
        
        if (data.substr(4,3) == "FIN") {
            data += dev->read();
            data += dev->read();
            if (!data.mlr_checksum())
                throw Exception("Checksum error.");
            // CR-LF
            dev->read();dev->read();
            return false;
        }
        data += dev->read();
        data += dev->read();
        
        if (data.substr(4,5) != "DEBUT")
            throw Exception("Syntax error - DEBUG.");
        data += dev->read();
        data += dev->read();
        if (!data.mlr_checksum())
            throw Exception("Checksum error2.");
        // CR-LF
        dev->read();dev->read();
        return true;
    }
    
    data += dev->read();
    uint8_t seqnum = data[-1];
    for (int i=0; i < seqnum; i++) {
        for (int j=0; j < 18; j++)
            data += dev->read();
        
        result.push_back(data.substr(data.size - 18, 18));
    }
    // Checksum
    data += dev->read();data += dev->read();
    if (!data.mlr_checksum())
        throw Exception("Checksum error2.");
    dev->read();dev->read();
    
    return true;
}

// TODO: Move to NMEA utility file

#define XON   0x11
#define XOFF 0x13
/* Do not accept more characters then maxline */
#define MAX_LINE   90
#define MAX_TOTAL  (10 * MAX_LINE)

vector<string> MLRGps::receive_data(const string &command)
{
    int received = 0;
    
    string recv_cmd;
    string param;
    vector<string> result;
    bool incmd = false;
    unsigned char cksum = 0;
    unsigned char ch;
    
    while (1) {
            ch = dev->read();
            received++;
            
            if (received > MAX_TOTAL)
                throw TimeoutException();
            
            if (ch == '$' ) {
                incmd = true;
                cksum = '$';
                param = "";
                recv_cmd = "";
                result.clear();
                continue;
            }
            if (!incmd)
                continue;
            
            if (ch != '*')
                cksum += ch;
            
            if (ch == ',' || ch == '*') {
                if (param.size()) {
                    if (!recv_cmd.size())
                        recv_cmd = param;
                    else
                        result.push_back(param);
                }
                param = "";
                if (ch == '*') {
                    string cksum_s = string() + (char)dev->read() + (char)dev->read();
                    unsigned char cksum_r = strtol(cksum_s.c_str(), NULL, 16);
                    dev->read();dev->read(); // CR, LF
                    if (cksum_r == cksum && recv_cmd == command)
                        return result;
                }
                continue;
            }
            param += ch;
    }
}
