OBJECTS = gipsy.o gipsymodule.o tracklog.o gpslib/data.o gpslib/garmin.o \
	gpslib/gps.o gpslib/phys.o gpslib/igc.o gpslib/aircotec.o cp1250.o \
	prefparser.o gpslib/foreignigc.o gpslib/mlr.o gpslib/flymaster.o \
	gpslib/compeo.o gpslib/iq.o

CPPFLAGS += -DHAVE_CRYPTO -fpermissive

all: $(TARGET) IGPSScanner.xpt

%.cpp: %.rl
	if ragel -v | grep 6.[0-9]; then \
		ragel -G0 -o $@ $<; \
	elif ragel -v | grep 5.23; then \
		ragel $< | rlgen-cd -G0 -o $@; \
	else \
		ragel $< | rlcodegen -G0 -o $@; \
	fi

%.inc: %.rl
	if ragel -v | grep 6.[0-9]; then \
		ragel -G0 -o $@ $<; \
	elif ragel -v | grep 5.23; then \
		ragel $< | rlgen-cd -G0 -o $@; \
	else \
		ragel $< | rlcodegen -G0 -o $@; \
	fi

gpslib/igc.o: gpslib/igcparser.inc

%.o: %.cpp
	$(CXX) -Wall -O2 -c $(GECKO_CONFIG_INCLUDE) $(CPPFLAGS) $(GECKO_DEFINES) $(GECKO_INCLUDES) -o $@ $<



IGPSScanner.h: IGPSScanner.idl
	$(XPIDL) -I$(XULIDLPATH) -m header $<

IGPSScanner.xpt: IGPSScanner.idl
	$(XPIDL) -I$(XULIDLPATH) -m typelib $<

$(TARGET): $(OBJECTS)
	$(CXX) -Wl,-z,defs -Wall -Os -o $(TARGET) $(SHARED) $(OBJECTS) $(CRYPTO_LIB) $(USB_LIB) $(GECKO_LDFLAGS)
	chmod +x $(TARGET)
ifeq "$(SHARED)" "-shared"
	strip $(TARGET)
endif

dep:
	gcc -MM *.cpp gpslib/*.cpp > .depend

clean: 
	-rm $(TARGET) *.o gpslib/*.o IGPSScanner.xpt IGPSScanner.h prefparser.cpp gpslib/igcparser.inc

tracklog.o: IGPSScanner.h
gipsy.o: IGPSScanner.h

-include .depend
