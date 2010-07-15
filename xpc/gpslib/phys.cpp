/*
 * GPS physical & link protocol implementation
 *
 */

#include <stdio.h>
#include <fcntl.h>
#include <errno.h>
#include <string.h>
#ifndef WIN32
# include <sys/time.h>
# include <unistd.h>
#endif
#include <time.h>

#include "phys.h"
#include "gps.h"
#include "garmin.h"
#include "endian.h"

/* Default timeout for GPS in secs */
const int GPS_TIMEOUT = 2;

using namespace std;

/* Wait for recieval of a particular packet type */
void PhysInterface::expect_packet(uint8_t pid, Data &packet) {
    uint8_t rec_pid;
    
    while (1) {
	recv_packet(rec_pid, packet);
	if (rec_pid == pid)
	    return;
    }
}

/* Constructor of serial interface, set speed on interface */
SerialInterface::SerialInterface(SerialDev *pdev) 
{ 
    dev = pdev; 
    dev->set_speed(9600);
}


/* Send packet and expect acknowledge */
void SerialInterface::send_packet(uint8_t pid, const Data &data) {
    send_packet(pid, data, true);
}

/* Receive packet and send acknowledge */
void SerialInterface::recv_packet(uint8_t &pid, Data &packet) {
    recv_packet(pid, packet, true);
}

/* Send acknowledgmenet to the GPS */
void SerialInterface::send_ack(uint8_t pid) {
    send_packet(Pid_Ack_Byte, Data(pid)+Data((uint8_t)0), false);
}

/* Send NAK to the GPS */
void SerialInterface::send_nak(uint8_t pid) {
    send_packet(Pid_Nak_Byte, Data(pid)+Data((uint8_t)0), false);
}

/* Wait for acknowledgement from GPS,
 * return True if OK, False if NAK received, otherwise exception
 */
bool SerialInterface::recv_ack(uint8_t pid) {
    uint8_t rec_pid;
    Data data;
    
    while (1) {
	recv_packet(rec_pid, data, false);
	if (rec_pid == Pid_Nak_Byte)
	    return false; /* Retransmit */
	if (rec_pid == Pid_Ack_Byte && data[0] == pid) {
	    return true;
	}
    }
}

/* Write escaped data to the GPS */
void SerialInterface::write_esc(const Data &data) {
    dev->write(data.replace(DLE, Data(DLE) + Data(DLE)));
}

/* Read data from GPS, unescape as needed */
uint8_t SerialInterface::read_dle() {
    uint8_t res = dev->read();

    if (res == DLE)
	if (dev->read() != DLE) {
	    int serr = errno;
	    throw ProtoException(string("Input stream broken: ") + strerror(serr));
	}
    return res;
}

/* Send packet to GPS */
void SerialInterface::send_packet(uint8_t pid, const Data &data, 
				  bool rcv_ack) 
{
    Data length((uint8_t)data.size);
    Data type(pid);
    
    Data chksum((type+length+data).checksum());
    Data escline(data.replace(DLE, Data(DLE)+Data(DLE)));
    
  retransmit:
    dev->write(DLE);
    write_esc(type + length + escline + chksum);
    dev->write(EOM);
    
    if (rcv_ack && !recv_ack(pid))
	goto retransmit;
}

/* Receive packet from GPS */
void SerialInterface::recv_packet(uint8_t &pid, Data &packet, bool snd_ack) 
{
    time_t starttime = time(NULL);

  retry:
    /* Synchronize on DLE */
    while (dev->read() != DLE)
	if (time(NULL) - starttime > GPS_TIMEOUT)
	    throw TimeoutException();
    pid = read_dle();
    
    /* Read packet id (must not be ETX) */
    if (pid == ETX)
	goto retry;
    
    try {
	/* Read packet size */
	uint8_t size = read_dle();
	/* Allocate data */
	uint8_t *data = new uint8_t[size];
	
	/* Read data */
	for (int i=0; i < size; i++) {
	    data[i] = read_dle();
	}
	
	Data result(data, size);
	delete data;
	
	/* Check checksum */
	uint8_t cksum = read_dle();
	if (cksum != (Data(pid)+Data(size)+Data(result)).checksum()) {
	    throw ProtoException("Invalid checksum");
	}
	/* Read the end */
	if (dev->read() != DLE)
	    throw ProtoException("End of stream not marked by DLE");
	if (dev->read() != ETX)
	    throw ProtoException("End of stream not marked by ETX");
	
	/* Set up return value */
	packet = result;
    } catch (ProtoException e) {
	send_nak(pid);
	goto retry;
    }
    if (snd_ack)
	send_ack(pid);
}

/* Send application packet to the GPS */
void USBInterface::send_packet(uint8_t pid, const Data &data)
{
    if (!usb_initialized)
	usb_handshake_init();
    
    send_packet(Ptype_APP, pid, data);
}

/* Receive application packet from GPS */
void USBInterface::recv_packet(uint8_t &pid, Data &packet)
{
    uint8_t ptype;

    if (!usb_initialized)
	usb_handshake_init();
    
    recv_packet(ptype, pid, packet);
    if (ptype == Ptype_USB)
	throw Exception("Received unexpected USB ptype packet.");
}

/* Receive packet using USB interface, handle physical protocol 
 * 
 * Return both Ptype_APP & Ptype_USB packets, but handle the 'Data available'
 * packet automatically and switch to reading 
 */
void USBInterface::recv_packet(uint8_t &ptype, uint8_t &pid, Data &packet)
{
    Data raw;

  retry:
    if (bulk_recv) {
	recv_usb_bulk_packet(raw);
	if (raw.size == 0) {
	    bulk_recv = false;
	    goto retry;
	}
    } else
	recv_usb_async_packet(raw);
    
    USBHead *head = (USBHead *) raw.buffer;
    if (raw.size < sizeof(*head) || 
	le32_to_host(head->size) != raw.size - sizeof(*head))
	throw Exception("Unexpected packet size.");

    /* We may lose data */
    pid = (uint8_t) le16_to_host(head->pid); 

    if (head->ptype == Ptype_USB && pid == Pid_Data_Available) {
	bulk_recv = true;
	goto retry;
    }

    ptype = head->ptype;
    packet = Data(raw.buffer + sizeof(*head), raw.size - sizeof(*head));
}

void USBInterface::send_packet(uint8_t ptype, uint8_t pid, const Data &data)
{
    USBHead head;
    
    memset(&head, 0, sizeof(head));
    head.ptype = ptype;
    head.pid = host_to_le16(pid);
    head.size = host_to_le32(data.size);
    
    Data dhead((uint8_t *)&head, sizeof(head));
    Data raw = dhead + data;
    send_usb_packet(raw);
}

void USBInterface::usb_handshake_init()
{
    Data packet;
    uint8_t ptype, pid;

    bulk_recv = false;
    usb_initialized = true;
    
    send_packet(Ptype_USB, Pid_Start_Session, Data(""));
    /* Wait for session start */
    while (1) {
	recv_packet(ptype, pid, packet);
	if (ptype == Ptype_USB && pid == Pid_Session_Started)
	    break;
    }
}

/****************************************************************/
/****** Platform-specific part **********************************/
/****************************************************************/

#ifdef WIN32
#include <Windows.h>
#include <winioctl.h>
#include <tchar.h>
#include <atlbase.h>
#include <atlconv.h>

WinSerialDev::WinSerialDev(const string &device) : SerialDev()
{
    USES_CONVERSION;

    handle = CreateFile(A2CW(device.c_str()), GENERIC_READ | GENERIC_WRITE,
			0, // exclusive access
			NULL, // no security
			OPEN_EXISTING,
			0, // no flags
			NULL // no overlap
			);
    if (handle == INVALID_HANDLE_VALUE)
	throw OpenException("Failed to open.");
    
    if (!PurgeComm(handle, PURGE_RXABORT | PURGE_RXCLEAR |PURGE_TXABORT | PURGE_TXCLEAR)) {
	CloseHandle(handle);
	throw Exception("PurgeComm failed.");
    }

    try {
	settimeout(GPS_TIMEOUT);
    } catch (Exception e) {
	CloseHandle(handle);
	throw(e);
    }
}

WinSerialDev::~WinSerialDev()
{
    CloseHandle(handle);
}
void WinSerialDev::set_speed(int baudrate)
{
    DCB dcb;
    if (!GetCommState(handle, &dcb)) {
	throw Exception("GetCommState failed.");
    }

    dcb.ByteSize = 8;
    dcb.Parity = NOPARITY;
    dcb.StopBits = ONESTOPBIT;

    switch (baudrate) {
    case 4800:
	dcb.BaudRate = CBR_4800;
	break;
    case 9600:
	dcb.BaudRate = CBR_9600;
	break;
    case 19200:
	dcb.BaudRate = CBR_19200;
	break;
    case 38400:
	dcb.BaudRate = CBR_38400;
	break;
    case 57600:
	dcb.BaudRate = CBR_57600;
	break;
    case 115200:
	dcb.BaudRate = CBR_115200;
	break;
    default:
	throw Exception("Unsupported speed");
    }

    if (!SetCommState(handle, &dcb))
	throw Exception("SetCommState failed.");
}

void WinSerialDev::settimeout(int secs)
{
    COMMTIMEOUTS timeouts;

    timeouts.ReadIntervalTimeout = 0;
    timeouts.ReadTotalTimeoutMultiplier = 0;
    timeouts.ReadTotalTimeoutConstant = 1000*secs;
    timeouts.WriteTotalTimeoutMultiplier = 0;
    timeouts.WriteTotalTimeoutConstant = 1000*secs;

    if (!SetCommTimeouts(handle, &timeouts))
	throw Exception("Failed to set timeouts on port.");
}

/* Read byte form Serial link, timeoute-aware */
uint8_t WinSerialDev::read()
{
    char c;
    DWORD n;
    int rc;

    rc = ReadFile(handle, &c, 1, &n, NULL);
    if (!rc) {
	int serr = errno;
	throw Exception(string("Read operation failed: ") + strerror(serr));
    }
    if (n != 1)
	throw TimeoutException();
    return c;
}
/* Write data to serial link, timeout-aware */
void WinSerialDev::write(const Data &data)
{
    int rc;
    DWORD n;

    rc = WriteFile(handle, data.buffer, data.size, &n, NULL);
    if (!rc) {
	throw Exception("Write operation failed.");
    }
    if (n != data.size)
	throw TimeoutException();
}

#define IOCTL_ASYNC_IN        CTL_CODE (FILE_DEVICE_UNKNOWN, 0x850, METHOD_BUFFERED, FILE_ANY_ACCESS)
#define IOCTL_USB_PACKET_SIZE CTL_CODE (FILE_DEVICE_UNKNOWN, 0x851, METHOD_BUFFERED, FILE_ANY_ACCESS)

WinUSBLink::WinUSBLink(const std::string &device)
{
    USES_CONVERSION;
    DWORD nret;

    handle = CreateFile(A2CW(device.c_str()), GENERIC_READ | GENERIC_WRITE, 0,
			NULL, OPEN_EXISTING, FILE_ATTRIBUTE_NORMAL, NULL);

    if (handle == INVALID_HANDLE_VALUE) {
	throw OpenException(string("open - error"));
    }

    // Get the USB packet size, which we need for sending packets
    DeviceIoControl(handle,IOCTL_USB_PACKET_SIZE, 0, 0, &usb_packet_size,
		    sizeof(usb_packet_size), &nret, NULL);
    
}

WinUSBLink::~WinUSBLink()
{
    CloseHandle(handle);
}

/* Set timeout on USB device (does it work?? does it make sense?) */
void WinUSBLink::settimeout(int secs)
{
}

/* Send raw data to GPS */
void WinUSBLink::send_usb_packet(const Data &data)
{
    DWORD written;
    int rc;
	
    rc = WriteFile(handle, data.buffer, data.size, &written, NULL);
    if (!rc)
	throw Exception("Error writing to GPS.");
    if (written != data.size)
	throw Exception("Not everything written to GPS.");

    // If the packet size was an exact multiple of the USB packet
    // size, we must make a final write call with no data
    if( data.size % usb_packet_size == 0 )
	WriteFile(handle, 0, 0, &written, NULL);
}

/* Receive async data packet */
void WinUSBLink::recv_usb_async_packet(Data &data)
{
    Data result;
    uint8_t tmpbuf[async_data_size];
    DWORD received;
    int rc;

    while (1) {
	rc = DeviceIoControl(handle, IOCTL_ASYNC_IN, 0, 0,
			     tmpbuf, async_data_size, &received, NULL);
	if (!rc)
	    throw Exception("Error receiveing async data.");

	result = result + Data(tmpbuf, received);
	if (received != async_data_size)
	    break;
    }
    data = result;
}

/* Read bulk data packet */
void WinUSBLink::recv_usb_bulk_packet(Data &data)
{
    DWORD recvd;
    int rc;

    // A full implementation would keep reading (and queueing)
    // packets until the driver returns a 0 size buffer.
    uint8_t *buf = new uint8_t[max_buffer_size];

    rc = ReadFile(handle, buf, max_buffer_size, &recvd, NULL);
    if (!rc)
	throw Exception("Error reading from bulk pipe.");

    data = Data(buf, recvd);
    delete buf;
}

#else // non-WIN32

#ifdef USE_LIBUSB

int UnixUSBLink::reset_garmin(void)
{
    Data resp;
    uint8_t ptype, pid;

    send_packet(Ptype_USB, Pid_Start_Session, Data(""));
    send_packet(Ptype_USB, Pid_Start_Session, Data(""));
    send_packet(Ptype_USB, Pid_Start_Session, Data(""));

    int t = 10;
    while (--t) {
	try {
	    recv_packet(ptype, pid, resp);
	} catch (Exception e) {
	    continue;
	}
	if (ptype == Ptype_USB && pid == Pid_Session_Started)
	    break;
    }
    if (!t) {
	throw OpenException("Cannot reset connection");
    }

    /* Now send product ID, which should reset Bulk pipe on devices
     * that do respond on bulk pipe */
    send_packet(Pid_Product_Rqst, "");
    t = 10;
    while (--t) {
	try {
	    recv_packet(ptype, pid, resp);
	} catch (Exception e) {
	    continue;
	}
	if (pid == Pid_Product_Data)
	    return 0;
    }
    return -1;
}

UnixUSBLink::UnixUSBLink(struct usb_device *dev)
{
    timeout = GPS_TIMEOUT * 1000;

    handle = usb_open(dev);
    if (!handle) {
	throw OpenException(string("open-error: ") + usb_strerror());
    }

    if (usb_set_configuration(handle, 1) < 0)
	goto out;

    if (usb_claim_interface(handle, 0) < 0)
	goto out;

    for (int i=0; i < dev->config->interface->altsetting->bNumEndpoints; i++) {
	struct usb_endpoint_descriptor * ep;
	ep = &dev->config->interface->altsetting->endpoint[i];
	
	switch (ep->bmAttributes & USB_ENDPOINT_TYPE_MASK) {
#define EA(x) x & USB_ENDPOINT_ADDRESS_MASK
	case USB_ENDPOINT_TYPE_BULK:
	    if (ep->bEndpointAddress & USB_ENDPOINT_DIR_MASK)
		bulk_in_ep = EA(ep->bEndpointAddress);
	    else
		bulk_out_ep = EA(ep->bEndpointAddress);
	    break;
	case USB_ENDPOINT_TYPE_INTERRUPT:
	    if (ep->bEndpointAddress & USB_ENDPOINT_DIR_MASK)
		intr_in_ep = EA(ep->bEndpointAddress);
	    break;
	}
    }
    if (!bulk_in_ep || !bulk_out_ep || !intr_in_ep)
	goto out;

    if (reset_garmin())
	goto out;

    return;
  out:
    usb_close(handle);
    throw OpenException(string("open-error: ") + usb_strerror());
}

UnixUSBLink::~UnixUSBLink()
{
    usb_close(handle);
}


/* Set timeout on USB device (does it work?? does it make sense?) */
void UnixUSBLink::settimeout(int secs)
{
    timeout = secs * 1000;
}

/* Send raw data to GPS */
void UnixUSBLink::send_usb_packet(const Data &data)
{
    int rc;

    rc = usb_bulk_write(handle, bulk_out_ep, (char *)data.buffer, data.size, timeout);
    if (rc < 0)
	throw Exception("Error writing to GPS.");
    if (rc != (int)data.size)
	throw Exception("Not everything written to GPS.");
}

/* Receive async data packet */
void UnixUSBLink::recv_usb_async_packet(Data &data)
{
    Data result;
    uint8_t tmpbuf[async_data_size];
    int rc;

    while (1) {
	rc = usb_interrupt_read(handle, intr_in_ep, (char *)tmpbuf, async_data_size, timeout);
	if (rc < 0)
	    throw Exception("Error receiveing async data.");

	result = result + Data(tmpbuf, rc);
	if (rc != async_data_size)
	    break;
    }
    data = result;
}

/* Read bulk data packet */
void UnixUSBLink::recv_usb_bulk_packet(Data &data)
{
    int rc;

    // A full implementation would keep reading (and queueing)
    // packets until the driver returns a 0 size buffer.
    uint8_t *buf = new uint8_t[max_buffer_size];

    rc = usb_bulk_read(handle, bulk_in_ep, (char *)buf, max_buffer_size, timeout);
    if (rc < 0)
	throw Exception("Error reading from bulk pipe.");

    data = Data(buf, rc);
    delete buf;
}

#endif

#include <termios.h>
#include <sys/select.h>

UnixSerialDev::UnixSerialDev(const string &device)
{
    fd = open(device.c_str(), O_RDWR | O_NONBLOCK);
    if (fd == -1) {
	int serr = errno;
	throw OpenException(string("open: ") + strerror(serr));
    }
    settimeout(GPS_TIMEOUT);

    /* Set terminal to RAW mode & 9600baud (probably 8N1, didn't find
     * a way how to affect it)
     */
    struct termios tio;

    if (tcgetattr(fd, &tio)) {
	int serr = errno;
	close(fd);
	throw Exception(string("Failed tcgetattr: ") + strerror(serr));
    }

    /* cfmakeraw(&tio); - BSD only, does the following */
    tio.c_iflag &= ~(IGNBRK | BRKINT | PARMRK | ISTRIP
                    | INLCR | IGNCR | ICRNL | IXON | IXOFF | IUCLC | IXANY | IMAXBEL | XCASE);
    tio.c_oflag &= ~OPOST;
    tio.c_lflag &= ~(ECHO | ECHONL | ICANON | ISIG | IEXTEN);
    tio.c_cflag &= ~(CSIZE | PARENB);
    tio.c_cflag |= CS8;

    if (tcsetattr(fd, 0, &tio)) {
	close(fd);
	throw Exception("Failed tcsetattr.");
    }
}

UnixSerialDev::~UnixSerialDev() 
{
    if (fd != -1)
	close(fd);
}

/* Read byte form Serial link, timeoute-aware */
uint8_t UnixSerialDev::read() {
    uint8_t res;
    int cnt;
    fd_set readfd;
    struct timeval tv;

    int retries = 5;

  retry:
    tv.tv_sec = timeout;
    tv.tv_usec = 0;
    FD_ZERO(&readfd);
    FD_SET(fd, &readfd);
    cnt = select(fd+1, &readfd, NULL, NULL, &tv);
    if (cnt == -1) {
	int lasterr = errno;
	perror("select-read");
	if (lasterr == EINTR && retries--)
	    goto retry;
	throw Exception("Error on select.");
    } else if (cnt == 0) {
	throw TimeoutException();
    }

    cnt = ::read(fd, &res, 1);
    if (cnt != 1) {
	throw Exception("Read error.");
    }
    return res;
}

void UnixSerialDev::set_speed(int baudrate)
{
    struct termios tio;

    if (tcgetattr(fd, &tio)) {
	int serr = errno;
	throw Exception(string("Failed tcgetattr: ") + strerror(serr));
    }

    speed_t speed;
    
    switch (baudrate) {
    case 4800:
	speed = B4800;
	break;
    case 9600:
	speed = B9600;
	break;
    case 19200:
	speed = B19200;
	break;
    case 38400:
	speed = B38400;
	break;
    case 57600:
	speed = B57600;
	break;
    case 115200:
	speed = B115200;
	break;
    default:
	throw Exception("Unsupported speed");
    }

    cfsetispeed(&tio, speed);
    cfsetospeed(&tio, speed);

    if (tcsetattr(fd, 0, &tio)) {
	throw Exception("Failed tcsetattr.");
    }
}

/* Write data to serial link, timeout-aware */
void UnixSerialDev::write(const Data &data) {
    int res;
    fd_set writefd;
    struct timeval tv;
    int cnt;
    unsigned int sent = 0;

#ifdef DEBUG
    data.print();
#endif
    while (sent < data.size) {
	tv.tv_sec = timeout;
	tv.tv_usec = 0;
	FD_ZERO(&writefd);
	FD_SET(fd, &writefd);
	cnt = select(fd+1, NULL, &writefd, NULL, &tv);
	if (cnt == -1) {
	    perror("select-write");
	    throw Exception("Error on select.");
	} else if (cnt == 0) {
	    throw TimeoutException();
	}
	
	res = ::write(fd, data.buffer+sent, data.size-sent);
	if (res == -1 || res == 0)
	    throw Exception("Write error.");
	    
	sent += res;
	
    }
}

/* Set timeout for I/O operation */
void UnixSerialDev::settimeout(int secs) {
    timeout = secs;
}    

#endif // WIN32
