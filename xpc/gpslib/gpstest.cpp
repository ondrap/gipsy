#include <iostream>

#include "gps.h"
#include "garmin.h"

using namespace std;

int main(int argc, char **argv)
{
    cout << "Getting ports" << endl;
    PortList ports = get_ports(true);

    for (unsigned int i=0; i < ports.size(); i++) {
	cout << "Device: " << ports[i].device << ", devname: " << ports[i].devname << endl;
	
	try {
	    Gps *gps = make_gps(ports[i].device, GPS_FLYMASTER);
	    if (gps) {
		cout << "GPS type: " << gps->gpsname << ", unitid: " << gps->gpsunitid << endl;
                for (size_t i=0; i < gps->saved_tracks.size(); i++) {
                    cout << "Track " << i << ": ";
                    cout << ctime(&gps->saved_tracks[i].first) << " ";
                    cout << ctime(&gps->saved_tracks[i].second) << endl;
                }
	    } else {
		cout << "GPS open failed" << endl;
	    }
	} catch (Exception e) {
	    cout << "Got exception, GPS open failed: " << e.error << endl;
	}
    }
}
