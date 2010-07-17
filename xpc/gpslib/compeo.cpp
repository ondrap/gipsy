#include <string>
#include <vector>
#include <sstream>
#include <iostream>
#include <iomanip>
#include <time.h>
#include <stdio.h>
// 
#include "compeo.h"
#include "igc.h"

#define XON  0x11
#define XOFF 0x13
/* Do not accept more characters then maxline */
#define MAX_LINE   90
#define MAX_TOTAL  (10 * MAX_LINE)

using namespace std;

/* Maximum timeout in seconds for readline, during download */
#define DOWN_TIMEOUT 1
#define BAUDRATE 57600
/* Maximum IGC file - 10MB */
#define MAX_IGC_FILE (10 * 1024 * 1024)

void CompeoGps::init_gps()
{
    dev->write(XON);
    dev->set_speed(BAUDRATE);
    
    vector<string> result;
    
    result = send_command("PBRSNP");
    gpsname = result[0];
    gpsunitid = atoi(result[2].c_str());
    
    /* Get tracks */
    int totaltracks;
    int trackno;
    send_smpl_command("PBRTL");
    do {
        vector<string> trackres = receive_data("PBRTL");
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

string CompeoGps::download_igc(int track, dt_callback cb, void *arg)
{
    vector<string> params;
    char tmpnum[5];
    sprintf(tmpnum, "%02d", track);
    params.push_back(tmpnum);
    dev->write(gen_command("PBRTR", params));
    
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
