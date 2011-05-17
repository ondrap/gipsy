#include <stdio.h>

#include <string>
#include <sstream>

#include "iq.h"
#include "data.h"

using namespace std;

#define BAUDRATE 57600
#define XON   0x11
#define XOFF 0x13

/* Maximum IGC file - 10MB */
#define MAX_IGC_FILE (10 * 1024 * 1024)

Data IqGps::send_command(string cmd)
{
    dev->write(cmd + "\r\n");
}

vector<string> IqGps::send_command_tbl(string cmd)
{
    dev->write(cmd + "\r\n");
}

void IqGps::init_gps()
{
    dev->set_speed(BAUDRATE);
    
    Data serial = send_command("RPA_00"); // uint32 -> serial number
    Data devtype = send_command("RPA_01"); // uchar -> 0 - 6015, 1 - IQ Basic
    
    if (devtype.buffer[0] == '\0')
        gpsname = "Flytec 6015";
    else
        gpsname = "Brauniger IQ Basic";
    
    gpsunitid = *((int *)serial.buffer);
    
    vector<string> lines = send_command_tbl("ACT_20_00"); // Get flight book
}

string IqGps::download_igc(int track, dt_callback cb, void *arg)
{
    char tmpnum[5];
    sprintf(tmpnum, "%02X", track);
    
    dev->write(string("ACT_21_") + string(tmpnum) + "\r\n"); // Get IGC flight
    
    stringstream igc;
    for (size_t size=0; size < MAX_IGC_FILE; size++) {
        try {
            char ch = (char) dev->read();
            if (ch == XON || ch == XOFF)
                continue;
            igc << ch;
            
            if (cb) {
                if (size % 100) {
                    bool rv = cb(arg, ((size/1000) % 20) + 1, 21);
                    if (!rv)
                        throw Exception("Download cancelled");
                }
            }
        } catch (TimeoutException e) {
            break;
        }
    }
    return igc.str();
}
