#ifndef _MLR_H_
#define _MLR_H_

#include "gps.h"
#include "phys.h"

class MLRGps : public Gps {
  public:
    MLRGps(SerialDev *pdev) { 
        dev = pdev; 
    };
    ~MLRGps() { delete dev; };

    /* Read GPS identification */
    void init_gps();

    
    /* Download tracklog from GPS */
    virtual PointArr download_tracklog(dt_callback cb, void *arg);

  private:
    SerialDev *dev;
    std::vector<std::string> receive_data(const std::string &command);
    bool read_sentence(std::vector<Data> &result, unsigned char &snum);
};

#endif
