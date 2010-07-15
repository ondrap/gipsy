// #include <string>
#include <vector>
#include <sstream>
#include <iostream>
#include <iomanip>
#include <time.h>
#include <string.h>

#include "flymaster.h"
#include "igc.h"
#include "data.h"

#define XON   0x11
#define XOFF 0x13
/* Do not accept more characters then maxline */
#define MAX_LINE   90
#define MAX_TOTAL  (10 * MAX_LINE)

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
        time_t startdate = mktime(&gtime);

        
        strptime(duration.c_str(), "%H:%M:%S", &gtime);
        time_t enddate = startdate + gtime.tm_hour * 3600 + gtime.tm_min * 60 + gtime.tm_sec;
        
        pair<time_t,time_t> item(startdate, enddate);

        saved_tracks.push_back(item);
    } while (trackno + 1 < totaltracks);
}

static string itoa(int num)
{
    stringstream data;
    data << num;
    return data.str();
}



PointArr FlymasterGps::download_tracklog(dt_callback cb, void *arg)
{
    PointArr result;
    Data data;
    
    char tmptime[31];
    strftime(tmptime, 30, "%y%m%d%H%M%S", localtime(&saved_tracks[selected_track].first));
    
    vector<string> args;
    args.push_back(tmptime);
    send_smpl_command("PFMDNL", args);
    
    while (1) {
        // Read packet ID
        cerr << 1 << endl;
        int packetid = dev->read() + (dev->read() << 8);
        cerr << 2 << endl;
        if (packetid == 0xa3a3)
            break;
        int length = dev->read();
        
        for (int i=0; i < length; i++)
            data += dev->read();
        
        unsigned char cksum = dev->read();
        // Compute checksum
        unsigned char c_cksum = length;
        for (int i=0; i < length; i++)
            c_cksum ^= data[i];
        
        if (c_cksum != cksum) {
            dev->write("\263");
            throw Exception("Checksum error");
        }
        
        if (packetid == 0xa0a0) {
            FM_Flight_Info finfo;
            if (sizeof(finfo) + 2 != data.size) {
                dev->write("\263");
                throw Exception("Data structure size doesn't match");
            }
            memcpy(&finfo, data.buffer, sizeof(finfo));
        } else if (packetid == 0xa1a1) {
            cerr << "Unsupported yet" << endl;
        }
        dev->write(0xb1);
    }

    return result;
}

/* Update NMEA checksum with additional data */
static void update_cksum(unsigned char &cksum, const string &data)
{
    for (size_t i=0; i < data.size(); i++)
        cksum ^= data[i];
}

string FlymasterGps::gen_command(const string &command, const vector<string> &parameters)
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

vector<string> FlymasterGps::send_command(const string &command, const vector<string> &parameters)
{
    send_smpl_command(command, parameters);
    return receive_data(command);
}

vector<string> FlymasterGps::send_command(const string &command)
{
    vector<string> parameters;
    
    return send_command(command, parameters);
}

void FlymasterGps::send_smpl_command(const string &command, const vector<string> &parameters)
{
    dev->write(gen_command(command, parameters));
}

void FlymasterGps::send_smpl_command(const string &command)
{
    vector<string> parameters;
    send_smpl_command(command, parameters);
}

vector<string> FlymasterGps::receive_data(const string &command)
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
