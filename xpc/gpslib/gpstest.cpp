#include <iostream>

#include "gps.h"

using namespace std;

int main(int argc, char **argv)
{
    Gps *gps = make_gps("/dev/ttyUSB0", GPS_MLR);
    gps->download_tracklog(NULL, NULL);
    
    return 0;
    
	cout << "Getting ports" << endl;
    PortList ports = get_ports(true);

    for (unsigned int i=0; i < ports.size(); i++) {
	cout << "Device: " << ports[i].device << ", devname: " << ports[i].devname << endl;
	
	try {
	    Gps *gps = make_gps(ports[i].device, GPS_GARMIN);
	    if (gps) {
		cout << "GPS type: " << gps->gpsname << ", unitid: " << gps->gpsunitid << endl;
	    } else {
		cout << "GPS open failed" << endl;
	    }
	    gps->download_tracklog(NULL, NULL);
	} catch (Exception e) {
	    cout << "Got exception, GPS open failed: " << e.error << endl;
	}
    }
}
