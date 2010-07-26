#include <algorithm>
#include <vector>
#include <sstream>
#include <iostream>
#include <iomanip>
#include <time.h>
#include <string.h>
#include <math.h>

#include "flymaster.h"
#include "igc.h"
#include "data.h"
#include "endian.h"

#ifdef WIN32
#   include "win_strptime.h"
#endif

#define XON   0x11
#define XOFF 0x13
/* Do not accept more characters then maxline */
#define MAX_LINE   90
#define MAX_TOTAL  (15 * MAX_LINE)

using namespace std;

/* Maximum timeout in seconds for readline, during download */
#define DOWN_TIMEOUT 1
#define BAUDRATE 57600

void FlymasterGps::init_gps()
{
    dev->set_speed(BAUDRATE);

    vector<string> result;

    result = send_command("PFMSNP");
    gpsname = result[0];
    
    // Compute unit id as a XOR of the result (to reduce conflicts with different HW, same serial etc.
    gpsunitid = 0;
    for (size_t i=0; i < result.size(); i++) {
        for (size_t j=0; j < result[i].size(); j++) {
            gpsunitid ^= result[i][j] << ((j % 4) * 8);
        }
    }

    // Download track list
    vector<string> args;
    args.push_back("LST");
    send_smpl_command("PFMDNL", args);
    
    int totaltracks;
    int trackno;
    do {
        vector<string> trackres = receive_data("PFMLST");
        totaltracks = atoi(trackres[0].c_str());
        trackno = atoi(trackres[1].c_str());
        string date = trackres[2];
        string start = trackres[3];
        string duration = trackres[4];

        struct tm gtime;
        strptime((date + " " + start).c_str(), "%d.%m.%y %H:%M:%S", &gtime);
        gtime.tm_isdst = 1;
        time_t startdate = make_gmtime(&gtime);
        
        strptime(duration.c_str(), "%H:%M:%S", &gtime);
        time_t enddate = startdate + gtime.tm_hour * 3600 + gtime.tm_min * 60 + gtime.tm_sec;
        
        pair<time_t,time_t> item(startdate, enddate);

        saved_tracks.push_back(item);
    } while (trackno + 1 < totaltracks);
}

static Trackpoint make_point(const FM_Key_Position fpos, bool newtrk)
{
    Trackpoint newpoint;
    
    newpoint.lat = fpos.latitude / 60000.0;
    newpoint.lon = - fpos.longitude / 60000.0;
    newpoint.gpsalt = fpos.gpsaltitude;
    newpoint.baroalt = (1 - pow(fabs((fpos.baro / 10.0)/1013.25), 0.190284)) * 44307.69;
    newpoint.time = fpos.time + 946684800;
    newpoint.new_trk = newtrk;
    
    return newpoint;
}

bool FlymasterGps::read_packet(int &packetid, Data &data)
{
    // Read packet ID
    packetid = dev->read() + (dev->read() << 8);
    if (packetid == 0xa3a3)
        return false;

    size_t length = dev->read();

    for (size_t i=0; i < length; i++)
        data += dev->read();

    unsigned char cksum = dev->read();
    // Compute checksum
    unsigned char c_cksum = length;
    for (size_t i=0; i < data.size; i++)
        c_cksum ^= data[i];
    
    if (c_cksum != cksum) {
        dev->write(0xb3);
        throw Exception("Checksum error");
    }
    return true;
}

void FlymasterGps::download_strack(size_t selected_track, PointArr &result, dt_callback cb, void *arg)
{
    char tmptime[31];
    int packetid;
    struct tm mtm;
    strftime(tmptime, 30, "%y%m%d%H%M%S", gmtime_r(&saved_tracks[selected_track].first, &mtm));
    
    bool newtrk = true;
    
    int pktcount = 0;
    int pcounter = 0;
    int expcount = (int) (saved_tracks[selected_track].second - saved_tracks[selected_track].first);
    
    vector<string> args;
    args.push_back(tmptime);
    send_smpl_command("PFMDNL", args);
    
    FM_Key_Position basepos;
    while (1) {
        Data data;

        if (!read_packet(packetid, data))
            break;
        
        if (packetid == 0xa0a0) {
            FM_Flight_Info finfo;
            if (sizeof(finfo) + 2 != data.size) {
                dev->write(0xb3);
                throw Exception("Data structure size doesn't match");
            }
            memcpy(&finfo, data.buffer, sizeof(finfo));
        } else if (packetid == 0xa1a1) {
            if (sizeof(basepos) != data.size) {
                dev->write(0xb3);
                throw Exception("Data structure size doesn't match");
            }
            memcpy(&basepos, data.buffer, sizeof(basepos));
            basepos.latitude = le32_to_host(basepos.latitude);
            basepos.longitude = le32_to_host(basepos.longitude);
            basepos.gpsaltitude = le16_to_host(basepos.gpsaltitude);
            basepos.baro = le16_to_host(basepos.baro);
            basepos.time = le32_to_host(basepos.time);
            result.push_back(make_point(basepos, newtrk));
            newtrk = false;
        } else if (packetid == 0xa2a2) {
            FM_Point_Delta delta;
            for (int i=0; i + sizeof(delta) <= data.size; i += sizeof(delta)) {
                memcpy(&delta, data.buffer + i, sizeof(delta));
                basepos.fix = delta.fix;
                basepos.latitude += delta.latoff;
                basepos.longitude += delta.lonoff;
                basepos.gpsaltitude += delta.gpsaltoff;
                basepos.baro += delta.baroff;
                basepos.time += delta.timeoff;
                
                pktcount += delta.timeoff;
                if (cb && !(pcounter++ % 60)) {
                    bool rv = cb(arg, pktcount, expcount);
                    if (!rv) {
                        dev->write(0xb3);
                        throw Exception("Download cancelled");
                    }
                }
                result.push_back(make_point(basepos, false));
            }
        }
        dev->write(0xb1);
    }
}

bool cmpint(const int &first, const int &second)
{
    return first > second;
}

PointArr FlymasterGps::download_tracklog(dt_callback cb, void *arg)
{
    PointArr result;
 
    // Sort tracks from the higher index to lower (older date first)
    // So that the resulting PointArr is time sorted
    sort(selected_tracks.begin(), selected_tracks.end(), cmpint);

    for (size_t i=0; i < selected_tracks.size(); i++) {
        download_strack(selected_tracks[i], result, cb, arg);
    }
    
    return result;
}

/* Update NMEA checksum with additional data */
static void update_cksum(unsigned char &cksum, const string &data)
{
    for (size_t i=0; i < data.size(); i++)
        cksum ^= data[i];
}

string NMEAGps::gen_command(const string &command, const vector<string> &parameters)
{
    stringstream data;
    unsigned char cksum = 0;
    
    data << '$';
    data << command << ',';
    update_cksum(cksum, command); update_cksum(cksum, ",");
    
    
    for (size_t i=0; i < parameters.size(); i++) {
        data << parameters[i];
        update_cksum(cksum, parameters[i]);
        data << ',';
        update_cksum(cksum, ",");
    }
    data << '*';
    data << uppercase << hex << setfill('0') << setw(2) << int(cksum);
    data << "\r\n";
    
    return data.str();
}

vector<string> NMEAGps::send_command(const string &command, const vector<string> &parameters)
{
    send_smpl_command(command, parameters);
    return receive_data(command);
}

vector<string> NMEAGps::send_command(const string &command)
{
    vector<string> parameters;
    
    return send_command(command, parameters);
}

void NMEAGps::send_smpl_command(const string &command, const vector<string> &parameters)
{
    dev->write(gen_command(command, parameters));
}

void NMEAGps::send_smpl_command(const string &command)
{
    vector<string> parameters;
    send_smpl_command(command, parameters);
}

vector<string> NMEAGps::receive_data(const string &command)
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
            
            // Ignore XON, XOFF
            if (ch == XON || ch == XOFF)
                continue;
            
            if (ch == '$' ) {
                incmd = true;
                cksum = 0;
                param = "";
                recv_cmd = "";
                result.clear();
                continue;
            }
            if (!incmd)
                continue;
            
            if (ch != '*')
                cksum ^= ch;
            
            if (ch == ',' || ch == '*') {
                if (param.size()) {
                    if (!recv_cmd.size())
                        recv_cmd = param;
                    else
                        result.push_back(param);
                }
                param = "";
                if (ch == '*') {
                    string cksum_s = string() + (char)dev->read();
                    cksum_s += (char)dev->read();
                    unsigned char cksum_r = (unsigned char) strtol(cksum_s.c_str(), NULL, 16);
                    dev->read();dev->read(); // CR, LF
                    if (cksum_r == cksum && recv_cmd == command)
                        return result;
                }
                continue;
            }
            param += ch;
    }
}
