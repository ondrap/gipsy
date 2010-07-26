#ifndef _IGC_H_
#define _IGC_H_

#include <string>
#include <vector>
#include <sstream>

#ifdef WIN32
# include "win_stdint.h"
#else
# include <stdint.h>
#endif

#include "point.h"

class Igc {
  public:
    Igc();
    Igc(const std::string &content);
    Igc(PointArr tlog, const std::string &gpsname, uint32_t gpsunitid);
    
    virtual bool gen_g_record();
    virtual bool validate();
    virtual std::string as_str();
    virtual bool can_modify() { return true; };

    std::string make_unique_id();

    PointArr tracklog;
    std::string pilot;
    std::string glider;
    std::string gliderid;
    std::string site;
    std::string country;
    std::string faiclass;
    bool biplace;

    std::string a_record;
    std::string g_record;
    std::string gpsname;
    uint32_t gpsunitid;
    // Optional application specific records that might be saved
    // in IGC file
    std::vector<std::pair<std::string, std::string > >  x_params;
    std::string l_record;

  protected:
    std::string gen_igc_s(bool only_signable);
    std::string make_h();
    std::string make_l();
    std::string make_xl(bool only_signable);
    std::vector<std::string> parse_lines(const std::string &content, bool skip_empty);
    void parse_h(const char *p);
    Trackpoint parse_b(const std::string &line);

    // If the IGC was read from file, save it to file_content
    std::string orig_file_content;
  
    // If during the read there were some inconsistencies, ensure
    // that it is invalid
    bool invalid_grecord;
};

class OriginalIgc : public Igc {
    public:
        OriginalIgc(const std::string &content) : Igc(content) {};
        virtual bool can_modify() { return false; };
};

time_t make_gmtime(struct tm *tm);
#ifdef WIN32
#ifndef MINGW
struct tm *gmtime_r(const time_t *timep, struct tm *mtm)
#endif
#endif

#endif
