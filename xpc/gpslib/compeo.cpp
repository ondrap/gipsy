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

void CompeoGps::init_gps()
{
    cerr << 1 << endl;
    dev->set_speed(BAUDRATE);
    
    vector<string> result;
    
    result = send_command("PBRSNP");
    gpsname = result[0];
    gpsunitid = atoi(result[2].c_str());
    
    cerr << gpsname << endl;
    cerr << gpsunitid << endl;
    
    /* Get tracks */
    result = send_command("PBRTL");
    int total_tracks = atoi(result[0].c_str());
    /*
    if (total_tracks) {
        saved_tracks.push_back(result[2] + " " + result[3] + ", " + result[4]);
        
        for (int i=0; i < total_tracks; i++) {
            result = receive_data("PBRTL");
            saved_tracks.push_back(result[2] + " " + result[3] + ", " + result[4]);
        }
    }
    */
}

static string itoa(int num)
{
    stringstream data;
    data << num;
    return data.str();
}
/*
virtual string CompeoGps::download_igc(int track, dt_callback cb, void *)
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
*/

PointArr CompeoGps::download_tracklog(dt_callback cb, void *arg)
{
}