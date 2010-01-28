/* $Id: cp1250.h 243 2007-04-15 20:49:20Z ondra $ */

#ifndef _CP1250_H_
#define _CP1250_H_

#include <string>

std::string cp1250_to_utf8(const std::string &str);
bool is_correct_utf8(const std::string &str);
bool is_ascii(const std::string &str);

#endif
