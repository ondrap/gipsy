#ifndef _AIRCOTEC_H_
#define _AIRCOTEC_H_

#include "gps.h"
#include "phys.h"

enum aircotec_height {
  AIRCOTEC_BARO,
  AIRCOTEC_GPS,
  AIRCOTEC_GPS_BARO
};


class AircotecGps : public Gps {
  public:
    AircotecGps(SerialDev *pdev) { dev = pdev; };
    ~AircotecGps() { delete dev; };
    
    /* Download tracklog from GPS */
    virtual PointArr download_tracklog(dt_callback cb, void *arg);

  private:
    SerialDev *dev;

    std::string ac_readline(dt_callback cb, void *arg, int pktcount, 
			    int expcount, int timeout);
    void get_header(dt_callback cb, void *arg, int &pointcount, time_t &basetime, enum aircotec_height &height_type);
};

#endif
