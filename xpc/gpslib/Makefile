CXXFLAGS = -Wall -DDEBUG -DUSE_LIBUSB
#CXXFLAGS = -Wall -DVALIDATOR
OBJS = gps.o phys.o data.o garmin.o igc.o flymaster.o compeo.o

WINLIBS = -lsetupapi

%.cpp: %.rl
	if ragel -v | grep 6.[0-9]; then \
		ragel -G0 -o $@ $<; \
	else \
		ragel $< | rlgen-cd -G0 -o $@; \
	fi

vali: vali.o igc.o
	$(CXX) $(CXXFLAGS) -static -o $@ vali.o igc.o  -lcrypto++
	strip $@

igc.o: igcparser.cpp

gpstest: gpstest.o phys.o aircotec.o data.o gps.o garmin.o igc.o mlr.o flymaster.o compeo.o
	$(CXX) $(CXXFLAGS) -static -o $@ gpstest.o phys.o aircotec.o data.o gps.o garmin.o igc.o mlr.o flymaster.o compeo.o -lcrypto++ -lusb

genkey: genkey.o
	$(CXX) $(CXXFLAGS) -o $@ genkey.o -lcrypto++

wintest: $(OBJS)
	$(CXX) $(CXXFLAGS) -o $@ $(OBJS) $(WINLIBS)

clean:
	-rm *.o gpstest vali
