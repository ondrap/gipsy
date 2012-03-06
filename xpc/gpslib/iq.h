#ifndef _IQ_H_
#define _IQ_H_

#include <string>
#include <vector>

#include "gps.h"
#include "phys.h"
#include "data.h"

class IqGps : public Gps {
  public:
    IqGps(SerialDev *pdev) { 
        dev = pdev; 
        init_gps();
    };
    ~IqGps() { delete dev; };
    
    /* Download tracklog from GPS */
    virtual std::string download_igc(int track, dt_callback cb, void *);
    virtual bool has_track_selection();
    
    SerialDev *dev;
  private:
    void init_gps();
    string send_command(std::string cmd);
    std::vector<std::string> send_command_tbl(std::string cmd);
    string ac_readline(int timeout);
};

#endif
