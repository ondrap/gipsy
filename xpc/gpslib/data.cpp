/* 
 * Module for convenience Data type resembling strings from python
 *
 */
#include <string.h>
#include <string>

#include "data.h"
#include "gps.h"

using namespace std;

Data::Data() 
{ 
    size = 0; buffer = 0; allocsize=0;
}

Data::Data(const Data &other) 
{
    size = other.size;
    buffer = new uint8_t[size];
    allocsize = size;
    memcpy(buffer, other.buffer, size);
}

Data::Data(unsigned char ch) 
{
    size = 1;
    buffer = new uint8_t[1];
    allocsize = 1;
    buffer[0] = (unsigned char)ch;
}

Data::Data(const char *str) 
{
    size = strlen(str);
    buffer = new uint8_t[size];
    memcpy(buffer, str, size);
    allocsize = size;
}

Data::Data(const string &str)
{
    size = str.size();
    buffer = new uint8_t[size];
    memcpy(buffer, str.c_str(), size);
    allocsize = size;
}

Data::Data(const uint8_t *dt, int sz) 
{
    size = sz;
    buffer = new uint8_t[size];
    memcpy(buffer, dt, size);
    allocsize = size;
}

Data Data::operator+(const Data &other) 
{
    Data thedata;
    
    thedata.size = size + other.size;
    thedata.allocsize = thedata.size;
    thedata.buffer = new uint8_t[thedata.size];
    memcpy(thedata.buffer, buffer, size);
    memcpy(thedata.buffer + size, other.buffer, other.size);
    
    return thedata;
}

Data &Data::operator+=(unsigned char c)
{
    uint8_t *newbuf;
    
    if (size == allocsize) {
        allocsize = (size +1) * 2;
        newbuf = new uint8_t[allocsize];
        memcpy(newbuf, buffer, size);
        if (buffer)
            delete buffer;
        buffer = newbuf;
    } 
    buffer[size] = c;
    size += 1;
    
    return *this;
}

bool Data::operator==(const Data &other)
{
    if (other.size != size)
        return false;
    if (memcmp(buffer, other.buffer, size) == 0)
        return true;
    return false;
}

Data & Data::operator=(const Data &other) 
{
    if (buffer)
	delete buffer;
    
    size = other.size;
    buffer = new uint8_t[other.size];
    
    memcpy(buffer, other.buffer, size);
    allocsize = size;
    
    return *this;
}

uint8_t Data::operator[](int index) {
    if (index < 0)
        index = size + index;
    
    if (index < 0 || (unsigned int)index >= size)
	throw Exception("Index out of bounds.");
    
    return buffer[index];
}

Data::~Data() {
    if (buffer)
	delete buffer;
}

/* Check MLR checksum */
bool Data::mlr_checksum() {
    uint16_t sum = 0;
    for (unsigned int i=0; i < size - 2; i++)
	sum += buffer[i];
    
    uint16_t hsum = (buffer[size-2] << 8) | buffer[size-1];
    
    return sum == hsum;
}

/* Compute checksum according to the Garmin specification */
uint8_t Data::checksum() {
    uint8_t sum = 0;
    for (unsigned int i=0; i < size; i++)
	sum += buffer[i];
    return 256 - sum;
}

uint32_t Data::long_checksum() {
    uint32_t sum = 0;
    for (unsigned int i=0; i < size; i++)
	sum += buffer[i] << ((i%4)*8);
    return sum;
}

Data Data::replace(uint8_t what, const Data &with) const {
    /* First count occurences of 'what' */
    int count = 0;
    unsigned int i,j;
    
    for (i=0; i < size; i++)
	if (buffer[i] == what)
	    count++;
    if (!count)
	return *this;
    
    uint8_t *newbuf = new uint8_t[size + count*with.size];
    for (i=0,j=0; i < size; i++) {
	if (buffer[i] == what) {
	    for (unsigned int k=0; k < with.size; k++)
		newbuf[j++] = with.buffer[k];
	} else
	    newbuf[j++] = buffer[i];
    }
    Data result(newbuf, size + count*with.size);
    delete newbuf;
    return result;
}

string Data::substr(size_t off, size_t sz) 
{
    if (off > size)
        throw Exception("Index out of bounds.");
    if (off + sz > size)
        sz = size - off;
    return string((char *)buffer + off, sz);
}

#include <stdio.h>
void Data::print() const {
    for (unsigned int i=0; i < size; i++) {
	if (buffer[i] >= ' ' && buffer[i] <= 'z')
	    printf("%c", buffer[i]);
	else
	    printf("\\x%02X", buffer[i]);
    }
    printf("\n");
}
