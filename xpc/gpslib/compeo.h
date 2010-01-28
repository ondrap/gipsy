#ifndef _COMPEO_H_
#define _COMPEO_H_

#include "gps.h"
#include "phys.h"

class CompeoGPS : public Gps {
  public:
    CompeoGPS(SerialDev *pdev) { 
        dev = pdev; 
        try {
            init_gps();
        } catch (Exception e) {
            delete dev;
            throw e;
        }
    };
    virtual ~CompeoGPS() { delete dev; };
    
    /* Download tracklog from GPS */
    virtual PointArr download_tracklog(dt_callback cb, void *arg);

  private:
    SerialDev *dev;
    void init_gps();
    
    std::vector<std::string> send_command(const std::string &command, const std::vector<std::string> &parameters);
    std::string ComepoGPS::gen_command(const std::string &command, const std::vector<std::string> &parameters)
    std::vector<std::string> send_command(const std::string &command);
    std::vector<std::string> receive_data(const std::string &command);
};

#endif