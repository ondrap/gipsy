#include <stdio.h>
#include <time.h>

#include <string>
#include <sstream>

#ifdef WIN32
#   include "win_strptime.h"
#endif

#include "iq.h"
#include "igc.h"
#include "data.h"

using namespace std;

#define BAUDRATE 57600
#define XON   0x11
#define XOFF 0x13

/* Maximum IGC file - 10MB */
#define MAX_IGC_FILE (10 * 1024 * 1024)

#define INIT_TIMEOUT 1

/* Read line from input & check the checksum */
/* Timeout specified in seconds, 0 means no timeout */
string IqGps::ac_readline(int timeout, string prefix)
{
    time_t starttime = time(NULL);
  restart:
    if (timeout && time(NULL) - starttime > timeout)
        throw TimeoutException();

    string result;
    char ch;

    while (1) {
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
	if (result.size() < (prefix.size() + 1))
		goto restart;
	if (result.substr(0, prefix.size()) != prefix)
		goto restart;
    return result;
}


string IqGps::send_command(string cmd)
{
    dev->write(cmd + "\r\n");
    return ac_readline(2, cmd).substr(cmd.size());
}

// Strip whitespace from a string
static string string_strip(string s)
{
    unsigned int i;
    for (i=0; i < s.size() && (s[i] == ' ' || s[i] == '\n' || s[i] == '\r'); i++)
        ;
    unsigned int start = i;
    for (i=s.size()-1; i > start && (s[i] == ' ' || s[i] == '\n' || s[i] == '\r'); i--)
        ;
    return s.substr(start, i - start + 1);
}

vector<string> IqGps::send_command_tbl(string cmd)
{
    vector<string> result;

    dev->write(cmd + "\r\n");
    while (1) {
        string line = string_strip(ac_readline(2, ""));
        if (line == "Done")
            break;
        result.push_back(line);
    }
    
    return result;
}

// Split string into fields by delimiter
vector<string> string_split(string &src, char delim)
{
    vector<string> result;
    string last;
    
    for (unsigned int i=0; i < src.size(); i++) {
        if (src[i] == delim) {
            result.push_back(string_strip(last));
            last = string();
        } else
            last += src[i];
    }
    result.push_back(string_strip(last));
    
    return result;
}

void IqGps::init_gps()
{
    dev->set_speed(BAUDRATE);
    
    string serial = send_command("RPA_00"); // uint32 -> serial number
    string devtype = send_command("RPA_01"); // uchar -> 0 - 6015, 1 - IQ Basic

    if (devtype == "00")
        gpsname = "Flytec 6015";
    else
        gpsname = "Brauniger IQ Basic";
    
    string version = send_command("RPA_02");
    gpsname += " - " + version;
    
    gpsunitid = strtol(serial.c_str(), NULL, 16);
    
    vector<string> lines = send_command_tbl("ACT_20_00"); // Get flight book
    for (unsigned int i=0; i < lines.size(); i++) {
        vector<string> fields = string_split(lines[i], ';');
        if (fields.size() < 5)
            continue;
        string stime = fields[1] + " " + fields[2];
        struct tm tm;
        strptime(stime.c_str(), "%y.%m.%d %H:%M:%S", &tm);
        time_t starttime = make_gmtime(&tm);

        strptime(fields[4].c_str(), "%H:%M:%S", &tm);
        time_t endtime = starttime + tm.tm_hour * 3600 + tm.tm_min * 60 + tm.tm_sec;

        pair<time_t,time_t> item(starttime, endtime);
        saved_tracks.push_back(item);
    }
}

bool IqGps::has_track_selection()
{
    return true;
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
