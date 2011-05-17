#ifndef _PHYS_H_
#define _PHYS_H_

#ifdef WIN32
# include "win_stdint.h"
#else
# include <stdint.h>
#endif

#include <string>

#include "data.h"

enum {
    Ptype_USB = 0,
    Ptype_APP = 20
};

enum {
    Pid_Data_Available = 2,
    Pid_Start_Session = 5,
    Pid_Session_Started = 6,
    Pid_Ack_Byte = 6,
    Pid_Command_Data = 10,
    Pid_Xfer_Complete = 12,
    Pid_Nak_Byte = 21,
    Pid_Records = 27,
    Pid_Rqst_Data = 28,
    Pid_Trk_Data = 34,
    Pid_Unit_ID = 38,
    Pid_Speed_Request = 48,
    Pid_Speed_Answer = 49,
    Pid_Trk_Hdr = 99,
    Pid_Protocol_Array = 253,
    Pid_Product_Rqst = 254,
    Pid_Product_Data = 255
};

#ifdef WIN32
# define gcc_pack
#pragma pack(push, 1)
#else
# define gcc_pack __attribute__((packed))
#endif
extern "C" {
    typedef struct {
	uint8_t ptype;
	uint8_t r1; // Reserved
	uint8_t r2; // Reserved
	uint8_t r3; // Reserved
	uint16_t pid;
	uint16_t r4; // Reserved
	uint32_t size;
    } gcc_pack USBHead;
}
#ifdef WIN32
# pragma pack(pop)
#endif

/* Abstract class representing a physical layer that can send and receive
 * packets */
class PhysInterface {
public:
    virtual ~PhysInterface() {};
    /* Convenience functions */
    virtual void send_packet(uint8_t pid, const Data &data) = 0;
    virtual void recv_packet(uint8_t &pid, Data &packet) = 0;
    /* Wait for receival of a particular packet type */
    void expect_packet(uint8_t pid, Data &packet);
};

/* Abstract class representing access to serial devices */
class SerialDev {
  public:
    SerialDev() {};
    virtual ~SerialDev() {};
    
    /* Set serial speed to baudrate */
    virtual void set_speed(int baudrate) = 0;
    /* Read byte form Serial link, timeoute-aware */
    virtual uint8_t read() = 0;
    /* Write data to serial link, timeout-aware */
    virtual void write(const Data &data) = 0;
    /* Set timeout for I/O operation */
    virtual void settimeout(int secs) = 0;
};


/* Generic serial link physical protocol implementation */
class SerialInterface : public PhysInterface {
  private:
    SerialDev *dev;

  public:
    SerialInterface(SerialDev *pdev);
    ~SerialInterface() { delete dev; };

    virtual void recv_packet(uint8_t &pid, Data &packet);
    virtual void send_packet(uint8_t pid, const Data &data);

    /* Send packet to GPS */
    virtual void send_packet(uint8_t pid, const Data &data, bool rcv_ack);    
    /* Receive packet from GPS */
    virtual void recv_packet(uint8_t &pid, Data &packet, bool snd_ack);

  protected:
    /* Write escaped data to the GPS */
    void write_esc(const Data &data);
    /* Read data from GPS, unescape as needed */
    uint8_t read_dle();
    /* Send acknowledgmenet to the GPS */
    void send_ack(uint8_t pid);
    /* Send NAK to the GPS */
    void send_nak(uint8_t pid);
    /* Wait for acknowledgement from GPS,
     * return True if OK, False if NAK received, otherwise exception
     */
    bool recv_ack(uint8_t pid);
};

/* Generic serial link physical protocol implementation */
class USBInterface : public PhysInterface {
public:
    USBInterface() { usb_initialized = false; bulk_recv = false; };
    virtual void recv_packet(uint8_t &pid, Data &packet);
    virtual void send_packet(uint8_t pid, const Data &data);

protected:
    /* Receive packet from GPS */
    virtual void recv_packet(uint8_t &ptype, uint8_t &pid, Data &packet);
    /* Send packet to GPS */
    virtual void send_packet(uint8_t ptype, uint8_t pid, const Data &data);
        
    /* Send raw data to GPS */
    virtual void send_usb_packet(const Data &data) = 0;
    /* Wait & receive raw packet from GPS */
    virtual void recv_usb_async_packet(Data &data) = 0;
    virtual void recv_usb_bulk_packet(Data &data) = 0;
  private:
    /* Special starting handshake for GPS communication */
    void usb_handshake_init();
    /* If false, force initialization on next GPS communication */
    bool usb_initialized;
    /* If true, expect data from Bulk USB pipe  */
    bool bulk_recv;
};

#ifdef WIN32
#include <windef.h>
class WinSerialDev : public SerialDev {
  private:
    HANDLE handle;
  public:
    WinSerialDev(const std::string &device);
    virtual ~WinSerialDev();

    virtual void set_speed(int baudrate);
    /* Read byte form Serial link, timeoute-aware */
    virtual uint8_t read();
    /* Write data to serial link, timeout-aware */
    virtual void write(const Data &data);
    /* Set timeout for I/O operation */
    virtual void settimeout(int secs);    
};

class WinUSBLink : public USBInterface {
  private:
    HANDLE handle;
    DWORD usb_packet_size;
    const static int max_buffer_size = 4096;
    const static unsigned int async_data_size = 64;
  public:
    WinUSBLink(const std::string &device);
    virtual ~WinUSBLink();
    
    /* Send raw data to GPS */
    virtual void send_usb_packet(const Data &data);
    /* Wait & receive raw packet from GPS */
    virtual void recv_usb_async_packet(Data &data);
    virtual void recv_usb_bulk_packet(Data &data);
    
    virtual void settimeout(int secs);    
};
#else // non-WIN32

#ifdef USE_LIBUSB
#include <usb.h>
class UnixUSBLink : public USBInterface {
  private:
    usb_dev_handle *handle;
    const static int max_buffer_size = 4096;
    const static int async_data_size = 64;
    int timeout;
    int bulk_out_ep, bulk_in_ep, intr_in_ep;

    int reset_garmin();
  public:
    UnixUSBLink(struct usb_device *usbdev);
    virtual ~UnixUSBLink();
    
    /* Send raw data to GPS */
    virtual void send_usb_packet(const Data &data);
    /* Wait & receive raw packet from GPS */
    virtual void recv_usb_async_packet(Data &data);
    virtual void recv_usb_bulk_packet(Data &data);
    
    virtual void settimeout(int secs);    
};
#endif

/* Unix serial link physical protocl implementation */
class UnixSerialDev : public SerialDev {
private:
    int fd;
    int timeout;
public:
    UnixSerialDev(const std::string &device);
    virtual ~UnixSerialDev();

    virtual void set_speed(int baudrate);
    /* Read byte form Serial link, timeoute-aware */
    virtual uint8_t read();
    /* Write data to serial link, timeout-aware */
    virtual void write(const Data &data);
    /* Set timeout for I/O operation */
    virtual void settimeout(int secs);
};

class TestDev : public SerialDev {
private:
    int fd;
public:
    TestDev(const std::string &fname);
    virtual ~TestDev();
    
    virtual void set_speed(int baudrate);
    virtual uint8_t read();
    virtual void write(const Data &data);
    virtual void settimeout(int secs);
};
#endif // WIN32

#endif
