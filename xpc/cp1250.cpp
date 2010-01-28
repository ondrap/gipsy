/* Conversion CP1250->UTF8 */

#include <string>

#include "cp1250.h"

using namespace std;

const struct {
    char cp1250;
    char utf8[3];
}cp1250_tbl[] = {
    {'\x8a', "\xc5\xa0"},
    {'\x8c', "\xc5\x9a"},
    {'\x8d', "\xc5\xa4"},
    {'\x8e', "\xc5\xbd"},
    {'\x8f', "\xc5\xb9"},
    {'\x9a', "\xc5\xa1"},
    {'\x9c', "\xc5\x9b"},
    {'\x9d', "\xc5\xa5"},
    {'\x9e', "\xc5\xbe"},
    {'\x9f', "\xc5\xba"},
    {'\xa3', "\xc5\x81"},
    {'\xa5', "\xc4\x84"},
    {'\xaa', "\xc5\x9e"},
    {'\xaf', "\xc5\xbb"},
    {'\xb3', "\xc5\x82"},
    {'\xb9', "\xc4\x85"},
    {'\xba', "\xc5\x9f"},
    {'\xbc', "\xc4\xbd"},
    {'\xbe', "\xc4\xbe"},
    {'\xbf', "\xc5\xbc"},
    {'\xc0', "\xc5\x94"},
    {'\xc1', "\xc3\x81"},
    {'\xc2', "\xc3\x82"},
    {'\xc3', "\xc4\x82"},
    {'\xc4', "\xc3\x84"},
    {'\xc5', "\xc4\xb9"},
    {'\xc6', "\xc4\x86"},
    {'\xc7', "\xc3\x87"},
    {'\xc8', "\xc4\x8c"},
    {'\xc9', "\xc3\x89"},
    {'\xca', "\xc4\x98"},
    {'\xcb', "\xc3\x8b"},
    {'\xcc', "\xc4\x9a"},
    {'\xcd', "\xc3\x8d"},
    {'\xce', "\xc3\x8e"},
    {'\xcf', "\xc4\x8e"},
    {'\xd0', "\xc4\x90"},
    {'\xd1', "\xc5\x83"},
    {'\xd2', "\xc5\x87"},
    {'\xd3', "\xc3\x93"},
    {'\xd4', "\xc3\x94"},
    {'\xd5', "\xc5\x90"},
    {'\xd6', "\xc3\x96"},
    {'\xd8', "\xc5\x98"},
    {'\xd9', "\xc5\xae"},
    {'\xda', "\xc3\x9a"},
    {'\xdb', "\xc5\xb0"},
    {'\xdc', "\xc3\x9c"},
    {'\xdd', "\xc3\x9d"},
    {'\xde', "\xc5\xa2"},
    {'\xe0', "\xc5\x95"},
    {'\xe1', "\xc3\xa1"},
    {'\xe2', "\xc3\xa2"},
    {'\xe3', "\xc4\x83"},
    {'\xe4', "\xc3\xa4"},
    {'\xe5', "\xc4\xba"},
    {'\xe6', "\xc4\x87"},
    {'\xe7', "\xc3\xa7"},
    {'\xe8', "\xc4\x8d"},
    {'\xe9', "\xc3\xa9"},
    {'\xea', "\xc4\x99"},
    {'\xeb', "\xc3\xab"},
    {'\xec', "\xc4\x9b"},
    {'\xed', "\xc3\xad"},
    {'\xee', "\xc3\xae"},
    {'\xef', "\xc4\x8f"},
    {'\xf0', "\xc4\x91"},
    {'\xf1', "\xc5\x84"},
    {'\xf2', "\xc5\x88"},
    {'\xf3', "\xc3\xb3"},
    {'\xf4', "\xc3\xb4"},
    {'\xf5', "\xc5\x91"},
    {'\xf6', "\xc3\xb6"},
    {'\xf8', "\xc5\x99"},
    {'\xf9', "\xc5\xaf"},
    {'\xfa', "\xc3\xba"},
    {'\xfb', "\xc5\xb1"},
    {'\xfc', "\xc3\xbc"},
    {'\xfd', "\xc3\xbd"},
    {'\xfe', "\xc5\xa3"},
    {'\0', "" }
};

static string recode_char(const char c)
{
    for (int i=0; cp1250_tbl[i].cp1250; i++) {
	if (cp1250_tbl[i].cp1250 == c)
	    return cp1250_tbl[i].utf8;
    }
    
    string res;
    res += c;

    return res;
}

string cp1250_to_utf8(const string &str)
{
    string result;

    for (unsigned int i=0; i < str.size(); i++) {
	result += recode_char(str[i]);
    }
    return result;
}

bool is_ascii(const string &str)
{
    for (unsigned int i=0; i < str.size(); i++)
	if (str[i] & 0x80)
	    return false;
    return true;
}

bool is_correct_utf8(const string &str)
{
    int dcount = 0; // Expected count of high bit characters

    for (unsigned i=0; i < str.size(); i++) {
	if (dcount) {
	    if ((str[i] & 0xc0) != 0x80)
		return false;
	    dcount--;
	    continue;
	}
	if ((str[i] & 0xe0) == 0xc0) {
	    dcount = 1;
	    continue;
	}
	if ((str[i] & 0xf0) == 0xe0) {
	    dcount = 2;
	    continue;
	}
	if ((str[i] & 0xf8) == 0xf0) {
	    dcount = 3;
	    continue;
	}
	if (str[i] & 0x80)
	    return false;
    }
    return dcount ? false : true;
}
