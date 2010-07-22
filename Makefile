# 

all: gipsy.xpi

ia32:
	$(MAKE) -C xpc
	cp xpc/IGPSScanner.xpt extension/components/
	#mkdir -p extension/platform/linux-gnu_x86-gcc3/components/
	mkdir -p extension/platform/Linux_x86-gcc3/components/
	mkdir -p extension/platform/Linux_x86-gcc4/components/
	mkdir -p extension/platform/Linux_x86_64-gcc3/components/
	mkdir -p extension/platform/WINNT_x86-msvc/components/
	#cp xpc/gipsy.so extension/platform/linux-gnu_x86-gcc3/components/
	cp xpc/gipsy.so extension/platform/Linux_x86-gcc3/components/
	cp xpc/gipsy.so extension/platform/Linux_x86-gcc4/components/
	

gipsy.xpi: extension/chrome/content/cities.db
	(cd extension;find . \! -regex ".*\\.svn.*" \! -regex ".*~\$$" | zip -@ ../gipsy.xpi)

extension/chrome/content/cities.db:
	(cd cities; rm cities.db; cat *.txt | ./builddb.py )
	cp cities/cities.db extension/chrome/content/cities.db

clean:
	$(MAKE) -C xpc clean
	-rm gipsy.xpi
