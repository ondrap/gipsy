/*
 * $Id: tracklog.h 240 2007-04-15 17:13:48Z ondra $
 */

#ifndef _TRACKLOG_H_
#define _TRACKLOG_H_

#include <string>
#include <vector>

#include "IGPSScanner.h"
#include "gpslib/igc.h"

class Tracklog : public IGPSIGC
{
public:
  NS_DECL_ISUPPORTS
  NS_DECL_IGPSIGC

  Tracklog(Igc *tigc);
  Tracklog();
  virtual ~Tracklog();

  Igc *igc;

private:
  std::vector<int> breakpoints;
  std::vector<int> breaklens;
  bool is_active_flight(int idx);
  bool is_not_flight(int idx);
  bool is_flight_begin(int idx);

  void make_break_points();
  bool allow_section(int idx);
  int interval_start(int idx);
  int interval_end(int idx);
  nsresult getparam(const char *param, std::string &val);

protected:
  /* additional members */
};

class GpsPoint: public IGPSPoint
{
public:
  NS_DECL_ISUPPORTS
  NS_DECL_IGPSPOINT

  GpsPoint(const Trackpoint &pt);
  GpsPoint();
  virtual ~GpsPoint();

private:

  static Trackpoint make_tpoint(IGPSPoint *other);

  double _distance(IGPSPoint *other);

  double lon, lat, alt;
  PRTime time;

protected:
  /* additional members */
};


#endif
