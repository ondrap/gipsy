/* Header file containing some Garmin constants
 *
 */
#ifndef _GARMIN_H_
#define _GARMIN_H_

#define DLE   '\x10'
#define ETX   '\x03'
#define EOM   "\x10\x03"

#define UNKNOWN_VALUE 1.0E25

/* Do not do some checks for the new GPS */
#define NEW_VERSION 795

extern "C" {

typedef float float32_t;

#ifdef WIN32
# define gcc_pack
#pragma pack(push, 1)
#else
# define gcc_pack __attribute__((packed))
#endif

typedef struct {
    uint16_t ID;
    uint16_t version;
    char description[1]; /* Zero terminated strings */
} gcc_pack Product_Data_Type ;

typedef struct {
    int32_t lat;
    int32_t lon;
} gcc_pack position_type;

typedef struct {
    position_type posn;
    uint32_t time;
    bool new_trk;
} gcc_pack D300_Trk_Point_Type;

typedef struct {
    position_type posn;
    uint32_t time;
    float32_t alt;
    float32_t depth;
    bool new_trk;
} gcc_pack D301_Trk_Point_Type;

typedef struct {
    position_type posn;
    uint32_t time;
    float32_t alt;
    float32_t depth;
    float32_t temp;
    bool new_trk;
} gcc_pack D302_Trk_Point_Type;

typedef struct {
    position_type posn;
    uint32_t time;
    float32_t alt;
    uint8_t heart_rate;
} gcc_pack D303_Trk_Point_Type;

typedef struct {
    position_type posn;
    uint32_t time;
    float32_t alt;
    float32_t distance;
    uint8_t heart_rate;
    uint8_t cadence;
    bool sensor;
} gcc_pack D304_Trk_Point_Type;

typedef struct {
    bool dspl;
    uint8_t color;
    char trk_ident[1];
} gcc_pack D310_Trk_Hdr_Type;

typedef struct {
    uint16_t index;
} gcc_pack D311_Trk_Hdr_Type;

typedef struct {
    bool dspl;
    uint8_t color;
    char trk_ident[1];
} gcc_pack D312_Trk_Hdr_Type;

#ifdef WIN32
# pragma pack(pop)
#endif

} // Extern C

enum {
    Cmnd_Abort_Transfer = 0,
    Cmnd_Transfer_Trk = 6,
    Cmnd_Unitid = 14,
    Cmnd_Ack_Ping = 58
};

#include <map>
#include <vector>

#include "phys.h"
#include "gps.h"

/* Class representing communication with GARMIN GPS */
class GarminGps : public Gps {
public:
    uint16_t gpsid;         /* ID of Garmin GPS */
    uint16_t gpsversion;    /* SW Version of Garmin GPS */

    GarminGps(PhysInterface *pdev) { 
	phys = pdev;
	try {
	    init_gps(); 
	} catch (Exception e) {
	    delete phys;
	    throw e;
	}
    };
    virtual ~GarminGps() { delete phys; };
    
    /* Download tracklog from GPS */
    virtual PointArr download_tracklog(dt_callback cb, void *arg);

private:
    /* Interface supporting physical comm protocol */
    PhysInterface *phys;

    /* Mapping of D<*> datatypes to protocols */
    std::map<int, std::vector <int> > proto_data;

    /* Decode data item according to the dtype parameter */
    Trackpoint decode_trk_data(const Data &data, int dtype);

    /* Download tracklog using A300, A301 & A302 protocols */
    PointArr A30xdownload(int proto, dt_callback cb, void *arg);

    /* Read GPS identification and supported protocols */
    void init_gps();
    /* Parse protocol_array structure and set appropriate identifications
     * of data structures to proto_data variable
     */
    void parse_proto(const Data &data);
    /* Send command to GPS using Command data protocol */
    void send_command(uint16_t command);
    /* Wait for Pid_Records & return expected packet count */
    int get_records();
    /* Get unitid */
    uint32_t get_unitid();
#if 0
    /* Send change speed command */
    void ChangeSpeed(uint32_t baudrate);
#endif
};


#endif
