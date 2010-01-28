#ifndef _DATA_H_
#define _DATA_H_

#include <string>

#ifdef WIN32
# include <win_stdint.h>
#else
# include <stdint.h>
#endif

/* Class for conveniently working with binary data */
class Data {
public:
    Data();
    Data(const Data &other);
    Data(unsigned char ch);
    Data(const std::string &str);
    Data(const char *str);
    Data(const uint8_t *dt, int sz);
    Data operator+(const Data &other);
    Data &operator=(const Data &other);
    uint8_t operator[](int index);
    ~Data();
    Data &operator+=(unsigned char c);

    /* Compute checksum according to the Garmin specification */
    uint8_t checksum();
    /* Compute /some/ checksum */
    uint32_t long_checksum();
    /* Check MLR checksum - true = OK, false = error */
    bool mlr_checksum();

    /* Substring of data */
    std::string substr(size_t off, size_t sz);

    Data replace(uint8_t what, const Data &with) const;

    void print() const;

    unsigned int size;
    unsigned int allocsize;
    uint8_t *buffer;
};



#endif
