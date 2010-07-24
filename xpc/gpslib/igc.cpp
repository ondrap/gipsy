/* 
 * IGC file downloader
 */
#include <iostream>
#include <sstream>

#include <math.h>
#include <string>
#include <time.h>
#include <stdio.h>
#include <string.h>

#ifdef HAVE_CRYPTO
# ifdef CRYPTPP
#  include <cryptopp/default.h>
#  include <cryptopp/rsa.h>
#  include <cryptopp/base64.h>
#  include <cryptopp/hex.h>
#  include <cryptopp/files.h>
#  include <cryptopp/osrng.h>
#else
#  include <crypto++/default.h>
#  include <crypto++/rsa.h>
#  include <crypto++/base64.h>
#  include <crypto++/hex.h>
#  include <crypto++/files.h>
#  include <crypto++/osrng.h>
# endif


# include "privatekey.txt"
# define PUBKEY "\x30\x81\x9D\x30\x0D\x06\x09\x2A\x86\x48\x86\xF7\x0D\x01\x01\x01\x05\x00\x03\x81\x8B\x00\x30\x81\x87\x02\x81\x81\x00\xB2\xE6\x4A\x4E\x27\xB3\xA8\x0A\x1E\xF5\x2C\x95\x70\xDA\x8C\x27\x61\xB9\xCA\xEE\xAC\xD4\x53\x13\x2A\x1F\x82\xFA\x1F\xC9\x9D\x0F\x16\xC7\x50\x69\xE0\x69\x40\xDB\x79\xDF\x1B\x4F\xD2\x65\x0B\xC2\xB5\x7C\x8C\x52\x4A\x0E\x2A\x4B\x45\xAE\xD1\x73\x14\xF3\x3A\xAE\xC0\x4B\x15\x93\xAB\xDC\x2E\x45\xD1\xD8\x46\x85\x32\xBC\xC8\x81\x64\x80\x31\xED\xF0\x8F\xB2\xAE\x15\xCE\x48\xB5\x31\x09\x3F\x58\xF5\x79\xE6\x86\xED\x17\x4D\xDB\x95\xEF\x4F\xD1\x60\xE3\x17\x2F\x54\x82\x47\x97\x08\xDD\xF0\x4B\x03\x75\x59\x24\x4A\x95\x3E\x67\x02\x01\x11"

using namespace CryptoPP;

#endif

#include "igc.h"

#define IGCLINE 76

using namespace std;

#define MAXLINE 256
#define DAY (24*60*60)

#ifdef WIN32

/* Gmtime is not thread-safe, we are running on our thread, but
 * to prevent collision with others use our function */
struct tm *my_gmtime(const time_t *timep)
{
#ifdef MINGW
    static __declspec( thread ) struct tm mtm;
    gmtime_s(&mtm, timep);
    return &mtm;
#else
    return gmtime(timep);
#endif
}
# define round(x)       floor((x) + 0.5)
# define snprintf(...)  _snprintf(__VA_ARGS__)

#else

/* Gmtime is not thread-safe, we are running on our thread, but
 * to prevent collision with others use our function */
struct tm *my_gmtime(const time_t *timep)
{
    static __thread struct tm mtm;

    gmtime_r(timep, &mtm);

    return &mtm;
}

#endif

time_t make_gmtime(struct tm *tm)
{
    time_t tz_offset; // No GMT mktime(), simulate it

    tm->tm_isdst = 0; // Compulsory, or it does not work
    // Initialize tz_offset to some near-by value
    tz_offset = 50000;
    tz_offset = tz_offset - mktime(my_gmtime(&tz_offset));

    return mktime(tm) + tz_offset;
}

/* Format lattitude as part of B record */
static string out_lat(double lat)
{
    char c = lat >= 0.0 ? 'N' : 'S';
    char result[MAXLINE];

    int ilat = (int) round(fabs(lat) * 60000);
    
    int deg = ilat / 60000;
    int min = (ilat - deg * 60000) / 1000;
    int sec = ilat - deg * 60000 - min * 1000;

    snprintf(result, MAXLINE, "%02d%02d%03d%c", deg, min, sec, c);

    return result;
}

/* Format longitude as part of B record */
static string out_lon(double lon)
{
    char c = lon >= 0.0 ? 'E' : 'W';
    char result[MAXLINE];

    int ilon = (int) round(fabs(lon) * 60000);
    
    int deg = ilon / 60000;
    int min = (ilon - deg * 60000) / 1000;
    int sec = ilon - deg * 60000 - min * 1000;

    snprintf(result, MAXLINE, "%03d%02d%03d%c", deg, min, sec, c);

    return result;
}

static string uitos(unsigned int i)	// convert int to string
{
    stringstream s;
    s << i;
    return s.str();
}

/* Make additional H record lines */
string Igc::make_h()
{
    stringstream result;

    if (pilot.size())
	result << "HPPLTPILOT:" << pilot << "\r\n";
    if (glider.size()) {
	result << "HPGTYGLIDERTYPE:" << glider;
	if (biplace)
	    result << " (biplace)";
	result << "\r\n";
    }
    if (gliderid.size())
	result << "HPGIDGLIDERID:" << gliderid << "\r\n";
    result << "HODTM100GPSDATUM: WGS-84\r\n";
    if (site.size()) {
	result << "HOSITSite:" << site;
	if (country.size())
	    result << " ("  << country << ')';
	result << "\r\n";
    }
    
    if (faiclass.size())
	result << "HPCCLCOMPETITION CLASS:" << faiclass << "\r\n";

    return result.str();
}

/* Make L records (pilot comment) */
string Igc::make_l()
{
    if (! l_record.size())
	return "";
    
    stringstream result;

    vector<string> lines = parse_lines(l_record, false);

    for (unsigned int i=0; i < lines.size(); i++)
	    result << "LPLT " << lines[i] << "\r\n";
    
    return result.str();
}

string Igc::make_xl(bool only_signable)
{
    stringstream result;

    for (unsigned int i=0; i < x_params.size(); i++) {
	if (x_params[i].first[0] == 'X')
	    result << "LXPG ";
	else {
	    if (only_signable)
		continue;
	    result << "LOOI ";
	}
	result << x_params[i].first << ' ';
	result << x_params[i].second << "\r\n";
    }

    return result.str();
}

/* Format time as part of HFDTE record */
static string igc_time(time_t ttime)
{
    char result[MAXLINE];
    
    struct tm *vt = my_gmtime(&ttime);
    snprintf(result, MAXLINE, "HFDTE%02d%02d%02d\r\n", vt->tm_mday, 
	     vt->tm_mon + 1, vt->tm_year % 100);

    return result;
}

/* Generate B-record line */
static string b_point(const Trackpoint &point)
{
    stringstream result;
    char tmp[MAXLINE];

    struct tm *vt = my_gmtime(&point.time);
    
    snprintf(tmp, MAXLINE,"B%02d%02d%02d",vt->tm_hour, vt->tm_min, vt->tm_sec);
    result << tmp;
    result << out_lat(point.lat);
    result << out_lon(point.lon);
    snprintf(tmp, MAXLINE, "%c%05d%05d", point.fix3d ? 'A' : 'V',
	     (int)round(point.baroalt),
	     (int)round(point.gpsalt));
    result << tmp << "\r\n";

    return result.str();
}

/* Generate IGC file content */
string Igc::gen_igc_s(bool only_signable)
{
    stringstream result;
    time_t lasttime;

    result << string("A") << a_record << "\r\n";

    if (tracklog.size() == 0)
	return result.str();

    result << igc_time(tracklog[0].time);
    lasttime = tracklog[0].time;
    
    if (!only_signable)
	result << make_h();

    for (PointArr::const_iterator iter = tracklog.begin();
	 iter != tracklog.end(); ++iter) {

	if ((*iter).time - lasttime >= DAY)
	    result << igc_time((*iter).time);
	lasttime = (*iter).time;

	result << b_point(*iter);
	
    }
    result << make_xl(only_signable);
    if (!only_signable) {
	result << make_l();
    }
    
    return result.str();
}

/* Split string to vector of non-empty lines */
vector<string> Igc::parse_lines(const string &content, bool skip_empty)
{
    vector<string> result;
    
    size_t eol;

    for (unsigned int i=0; i < content.size();i=eol+1) {
	eol = content.find('\n', i);
	if (eol == string::npos)
	    eol = content.size();
	int j = eol - 1;
	while ((content[j] == '\r' || content[j] == ' ') && j > 0)
	    j--;
	
	if (j-(int)i > 0 || !skip_empty)
	    result.push_back(content.substr(i, j-i+1));
    }

    return result;
}

/* Parse B record, return trackpoint with the time
 * set relative to the start of the day
 */
Trackpoint Igc::parse_b(const string &line)
{
    int latd,latm,lats;
    char latp, lonp;
    int lond,lonm,lons;
    int baroalt;
    int altitude;
    char fix;

    int hour, min, sec;

    Trackpoint result;

    sscanf(line.c_str(), "B%2d%2d%2d%2d%2d%3d%c%3d%2d%3d%c%c%5d%5d",
	   &hour, &min, &sec,
	   &latd,&latm,&lats,&latp,
	   &lond,&lonm,&lons,&lonp,
	   &fix, &baroalt, &altitude);
    // Some lines may be longer, make myself invalid if there
    // are additional characters in the end
    if (fix != 'A' && fix != 'V')
	invalid_grecord = true;
    if (line.length() > 35)
	invalid_grecord = true;

    result.fix3d = (fix == 'A');
    result.time = hour*3600 + min*60 + sec;
    result.gpsalt = altitude;
    result.baroalt = baroalt;
    result.lat = (double)latd + latm/60.0 + lats/60000.0;
    if (latp == 'S')
	result.lat *= -1;

    result.lon = (double)lond + lonm/60.0 + lons/60000.0;
    if (lonp == 'W')
	result.lon *= -1;

    return result;
}

/* Initialize from IGC file */
Igc::Igc(const string &content) : biplace(false), invalid_grecord(false)
{
    // Save content
    orig_file_content = content;

    vector<string> lines = parse_lines(content, true);
    time_t base = 0;
    time_t last = 0;

    for (vector<string>::iterator iter = lines.begin(); iter != lines.end();++iter) {
	switch ((*iter)[0]) {
	case 'A':
	    a_record = (*iter).substr(1, (*iter).size() - 1);
	    break;
	case 'B': {
	    Trackpoint point = parse_b(*iter);
	    point.time += base;
	    if (point.time < last && last-(point.time+base) < 60) {
		/* Fix the invalid tracklog */
		invalid_grecord = true;
		tracklog[tracklog.size() - 1] = point;
	    } else {
		/* Update time */
		if (point.time < last) {
		    point.time += 24*60*60;
		    base += 24*60*60;
		}
		tracklog.push_back(point);
	    }
	    last = point.time;
	}
	    break;
	case 'H': {
	    const char *p = (*iter).c_str();
            #include "igcparser.inc"
	}	    
	    break;
	case 'L':
	    if ((*iter).size() < 4) {
		invalid_grecord = true;
		break;
	    }
	    if ((*iter).substr(0, 4) == "LPLT" && (*iter).size() >= 4) {
		if ((*iter).size() >= 5)
		    l_record += (*iter).substr(5);
		l_record += "\r\n";
	    } else if (((*iter).substr(0, 4) == "LOOI") || (*iter).substr(0, 4) == "LXPG") {
		// Parse extended values
		string tmp = (*iter).substr(4);
		if (!tmp.size() || tmp[0] != ' ')
		    break;

		tmp = tmp.substr(1);
		size_t spacepos = tmp.find(' ');
		if (spacepos == string::npos || spacepos == 0 \
		    || spacepos == tmp.size() - 1)
		    break;
		
		string key = tmp.substr(0, spacepos);
		string val = tmp.substr(spacepos+1);
		pair<string,string> item(key,val);
		// Test if the value is not already added
		for (unsigned int i=0; i < x_params.size(); i++)
		    if (x_params[i].first == key)
			break;
		x_params.push_back(item);
		if ((*iter).substr(0, 4) == "LXPG" && key[0] != 'X')
		    invalid_grecord = true;
		if ((*iter).substr(0, 4) == "LOOI" && key[0] == 'X')
		    invalid_grecord = true;
		break;
	    } else
		invalid_grecord = true;
	    break;
	case 'G':
	    g_record += (*iter).substr(1);
	    break;
	default:
	    invalid_grecord = true;
	    break;
	}
    }
}

Igc::Igc(PointArr tlog, const string &gpsname, 
	 uint32_t gpsunitid) : tracklog(tlog), biplace(false),
			       invalid_grecord(false)
			       
{
    a_record = "XPG " + gpsname + " - " + uitos(gpsunitid);
    this->gpsname = gpsname;
    this->gpsunitid = gpsunitid;
}

Igc::Igc() : invalid_grecord(true)
{
    // "Uninitalized" igc file
}

/* Generate G record from data 
 *
 * @return true - success, false - error
 */
bool Igc::gen_g_record()
{
#if defined(HAVE_CRYPTO) && !defined(VALIDATOR)
    string text_to_sign = gen_igc_s(true);

    g_record = "";

    try {
	AutoSeededRandomPool randPool;
	
	StringSource privFile((const byte *)PRIVKEY, 632, true);
	RSASS<PKCS1v15, SHA>::Signer priv(privFile);
	
	StringSource(text_to_sign.c_str(), true,
		     new SignerFilter(randPool, priv, 
				      new HexEncoder(new StringSink(g_record))));
    } catch (CryptoPP::Exception e) {
	return false;
    }
    return true;
#else
    g_record = "";
    return false;
#endif
}

/* Make uniqe id by taking 1 character from first name and 2 from last */
string Igc::make_unique_id()
{
    string result;

    for (unsigned int i=0; i < pilot.length(); i++)
	if (isascii(pilot[i]) && isalpha(pilot[i])) {
	    result += toupper(pilot[i]);
	    break;
	}
    
    size_t pos = pilot.rfind(' ');
    if (pos != string::npos) {
	for (; pos < pilot.length() && result.length() < 3; pos++)
	    if (isascii(pilot[pos]) && isalpha(pilot[pos]))
		result += toupper(pilot[pos]);
    }
    
    while (result.length() < 3)
	result += 'X';

    return result;
}

/* Return True if the IGC file conforms with the g-record */
bool Igc::validate()
{
    if (!g_record.size())
	return false;

    if (invalid_grecord)
	return false;

#ifdef HAVE_CRYPTO
    
    string text_to_sign = gen_igc_s(true);

    try {
	StringSource pubFile((const byte*)PUBKEY, 160, true);
	RSASS<PKCS1v15, SHA>::Verifier pub(pubFile);

	StringSource signatureFile(g_record, true, new HexDecoder);
    
	SecByteBlock signature( pub.SignatureLength());
	signatureFile.Get(signature, signature.size());
	
	VerifierFilter *verifierFilter = new VerifierFilter(pub);
	verifierFilter->Put(signature, pub.SignatureLength());
	
	StringSource ssource(text_to_sign, true, verifierFilter );

	return verifierFilter->GetLastResult();
    } catch (CryptoPP::Exception e) {
	return false;
    }
#else
    return false;
#endif
}

#define min(a,b) ((a) > (b) ? (b) : (a))

/* Export IGC file */
string Igc::as_str()
{
    // If we were read from file, return original file
    if (orig_file_content.size())
	return orig_file_content;

    string result = gen_igc_s(false);

    // Add G record to the text
    string tmp = g_record;

    /* The line is maximum 76 characters */
    while(tmp.size()) {
	int pos_mv = min(IGCLINE-1, tmp.size());

	result += string("G") + tmp.substr(0, pos_mv) + "\r\n";
	tmp = tmp.substr(pos_mv);
    }

    return result;
}
