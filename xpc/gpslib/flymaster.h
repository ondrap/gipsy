#ifndef _FLYMASTER_H_
#define _FLYMASTER_H_

#ifdef WIN32
# include <win_stdint.h>
#else
# include <stdint.h>
#endif

#include "gps.h"
#include "phys.h"

#ifdef WIN32
# define gcc_pack
#pragma pack(push, 1)
#else
# define gcc_pack __attribute__((packed))
#endif

extern "C" {
    
typedef struct {
    uint16_t sw_version;
    uint16_t hw_version;
    uint32_t serial;
    char compnum[8];
    char pilotname[15];
    char gliderbrand[15];
    char glidermodel[15];
} gcc_pack FM_Flight_Info;

typedef struct {
    char fix;
    int32_t latitude;
    int32_t longitude;
    int16_t gpsaltitude;
    int16_t baro;
    uint32_t time;
} gcc_pack FM_Key_Position;

typedef struct {
    char fix;
    int8_t latoff;
    int8_t lonoff;
    int8_t gpsaltoff;
    int8_t baroff;
    uint8_t timeoff;
} gcc_pack FM_Point_Delta;

}
#ifdef WIN32
# pragma pack(pop)
#endif

class NMEAGps : public Gps {
    public:
        NMEAGps(SerialDev *pdev) { 
            dev = pdev; 
        };
        virtual ~NMEAGps() { delete dev; };
        SerialDev *dev;
    protected:
        std::vector<std::string> send_command(const std::string &command, const std::vector<std::string> &parameters);
        std::string gen_command(const std::string &command, const std::vector<std::string> &parameters);
        std::vector<std::string> send_command(const std::string &command);
        void send_smpl_command(const std::string &command, const std::vector<std::string> &parameters);
        void send_smpl_command(const std::string &command);
        std::vector<std::string> receive_data(const std::string &command);
};

class FlymasterGps : public NMEAGps {
    public:
        FlymasterGps(SerialDev *pdev) : NMEAGps(pdev) {
            init_gps();
        };
        virtual ~FlymasterGps() {};
        /* Download tracklog from GPS */
        virtual PointArr download_tracklog(dt_callback cb, void *arg);
        /* Redefine - we have one */
        virtual bool has_track_selection();
    private:
        void init_gps();
        void download_strack(size_t selected_track, PointArr &result, dt_callback cb, void *arg);
        bool read_packet(int &packetid, Data &data);
};

#endif
