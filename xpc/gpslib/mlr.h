#ifndef _MLR_H_
#define _MLR_H_

#include "gps.h"
#include "phys.h"
#include "flymaster.h"

class MLRGps : public NMEAGps {
  public:
    MLRGps(SerialDev *pdev) : NMEAGps(pdev) {};
    virtual ~MLRGps() {};
    /* Read GPS identification */
    void init_gps();
    /* Download tracklog from GPS */
    virtual PointArr download_tracklog(dt_callback cb, void *arg);
  private:
    bool read_sentence(std::vector<Data> &result, unsigned char &snum);
};

#endif
