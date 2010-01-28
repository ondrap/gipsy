#include <string>
#include <vector>
#include <sstream>
#include <iostream>
#include <iomanip>
#include <time.h>

#include "compeo.h"
#include "igc.h"

#define XON   0x11
#define XOFF 0x13
/* Do not accept more characters then maxline */
#define MAX_LINE   90
#define MAX_TOTAL  (10 * MAX_LINE)

using namespace std;

/* Maximum timeout in seconds for readline, during download */
#define DOWN_TIMEOUT 1
#define BAUDRATE 57600
/* Maximum IGC file - 10MB */
#define MAX_IGC_FILE 10*1024*1024

void CompeoGPS::init_gps()
{
    dev->set_speed(BAUDRATE);
    
    vector<string> result;
    
    result = send_command("PBRSNP");
    gpsname = result[0];
    gpsunitid = atoi(result[2].c_str());
    
    /* Get tracks */
    result = send_command("PBRTL");
    int total_tracks = atoi(result[0].c_str());
    if (total_tracks) {
        saved_tracks.push_back(result[2] + " " + result[3] + ", " + result[4]);
        
        for (int i=0; i < total_tracks; i++) {
            result = receive_data("PBRTL");
            saved_tracks.push_back(result[2] + " " + result[3] + ", " + result[4]);
        }
    }
}

static string itoa(int num)
{
    stringstream data;
    data << num;
    return data.str();
}

virtual string CompeoGPS::download_igc(int track, dt_callback cb, void *)
{
    vector<string> params;
    params.push_back(itoa(track));
    dev->write(gen_command("PBRTR", params));
    
    stringstream igc;
    while (igc.size() < MAX_IGC_FILE) {
        try {
            igc << (char)dev->read();
        } catch (TimeoutException e) {
            break;
        }
    }
    return igc.str();
}

/* Update NMEA checksum with additional data */
static void update_cksum(unsigned char &cksum, const string &data)
{
    for (size_t i=0; i < data.size(); i++)
        cksum ^= data[i];
}

string ComepoGPS::gen_command(const string &command, const vector<string> &parameters)
{
    stringstream data;
    unsigned char cksum = 0;
    
    data << '$';
    data << command << ',';
    update_cksum(cksum, command); update_cksum(cksum, ",");
    
    for (size_t i=0; i < parameters.size(); i++) {
        data << parameters[i];
        update_cksum(cksum, parameters[i]);
        if (i+1 < parameters.size()) {
            data << ',';
            update_cksum(cksum, ",");
        }
    }
    data << '*';
    data << uppercase << hex << setfill('0') << setw(2) << cksum;
    data << "\r\n";
    
    return data.str();
}

vector<string> CompeoGPS::send_command(const string &command, const vector<string> &parameters)
{
    dev->write(gen_command(command, parameters));
    
    return receive_data(command);
}

vector<string> CompeoGPS::send_command(const string &command)
{
    vector<string> parameters;
    
    return send_command(command, parameters);
}

vector<string> CompeoGPS::receive_data(const string &command)
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
