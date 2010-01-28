#ifndef _ENDIAN_H_
#define _ENDIAN_H_

#ifdef _BIG_ENDIAN

static inline uint32_t swap_32(uint32_t n)
{
        return ((n & 0xff) << 24) |
                ((n & 0xff00) << 8) |
                ((n & 0xff0000) >> 8) |
                ((n & 0xff000000) >> 24);
}

static inline uint16_t swap_16(uint16_t n)
{
        return ((n & 0xff) << 8) |
                ((n & 0xff00) >> 8);
}


#define le32_to_host(x) swap_32(x)
#define le16_to_host(x) swap_16(x)
#define host_to_le32(x) swap_32(x)
#define host_to_le16(x) swap_16(x)

static inline float float_to_host(float f)
{
	uint32_t temp;
	temp = swap_32(*((uint32_t *) &f));
	
	return *((float *)&temp);
}

#else

#define le32_to_host(x) x
#define le16_to_host(x) x
#define host_to_le32(x) x
#define host_to_le16(x) x
#define float_to_host(x) x

#endif

#endif
