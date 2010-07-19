// 'GoogleMaps'-like API

htmlns = "http://www.w3.org/1999/xhtml";

function TerrainMap(id) {
    this.main = document.getElementById(id);
    this.main.style.overflow = 'hidden';
    this.main.style.position = 'relative';

    this.dragarea = document.createElementNS(htmlns, 'div');
    this.dragarea.style.position = 'absolute';
    this.main.appendChild(this.dragarea);
    
    this.maparea = document.createElementNS(htmlns, 'div');
    this.dragarea.appendChild(this.maparea);
    this.maparea.appendChild(document.createTextNode('Hello World'));

    this.dragging = false;
    this.x = 0;
    this.y = 0;
    this.zoom = 13;
    // Array to store loaded tiles
    this.loaded_tiles = new Array();

    var self = this;

    this.mousedown = function(evt) {
        if (evt.which == 1) {
            self.dragging = true;
            self.lastx = evt.clientX;
            self.lasty = evt.clientY;
        }
    }
    this.mouseup = function(evt) {
        if (self.dragging && evt.which == 1) {
            self.dragging = false;
            self.load_images();
        }
    }
    this.mousemove = function(evt) {
        if (!self.dragging)
            return;
        self.x += self.lastx - evt.clientX;
        self.y += self.lasty - evt.clientY;
        
        // Check map limits
        var xlimit = 256 * (1 << (17 - self.zoom)) - self.main.offsetWidth;
        var ylimit = 256 * (1 << (17 - self.zoom)) - self.main.offsetHeight;
        if (self.x > xlimit)
            self.x = xlimit;
        if (self.y > ylimit)
            self.y = ylimit;
        
        if (self.x < 0)
            self.x = 0;
        if (self.y < 0)
            self.y = 0;

        self.dragarea.style.left = (-self.x).toString() + 'px';
        self.dragarea.style.top = (-self.y).toString() + 'px';
        self.lastx = evt.clientX;
        self.lasty = evt.clientY;
        self.load_images();
    }
    this.resize = function() {
        self.load_images();
    }
    
    this.main.addEventListener('mousedown', this.mousedown, false);
    this.main.addEventListener('mousemove', this.mousemove, false);
    window.addEventListener('resize', this.resize, false);
    window.addEventListener('mouseup', this.mouseup, false);

    this.load_images();
}

TerrainMap.prototype.load_images = function() {
    // Show areas that are outside the bounds function
    for (var x=this.x; x < this.x + this.main.clientWidth + 256; x += 256)
        for (var y=this.y; y < this.y + this.main.clientHeight + 256; y += 256) {
            var xtile = Math.floor(x / 256);
            var ytile = Math.floor(y / 256);
            var link = this.get_map_link('map_googlemap', this.zoom, xtile, ytile, 'vt/lyrs=m@129');
            if (!this.loaded_tiles[link]) {
                this.loaded_tiles[link] = true;
                img = document.createElementNS(htmlns, 'img');
                img.setAttribute('src', link);
                img.style.left = (xtile * 256) + 'px';
                img.style.top = (ytile * 256) + 'px';
                img.style.position = 'absolute';
                this.maparea.appendChild(img);
            }
        }
};

TerrainMap.prototype.get_map_link = function(maptype, zoom, xtile, ytile, mapsuffix) {
    if (maptype == 'map_googlemap') {
        var svr = 'mt' + Math.floor(Math.random() * 4);
        var link = 'http://' + svr + '.google.com/' + mapsuffix;
        link += '&x=' + xtile + '&y=' + ytile + '&z=' + (17 - zoom);
        // Security?
        link += '&s=' + 'Galileo'.substr(0, (xtile*3+ytile) % 8);
    } else if (maptype == 'map_googleoverlay') {
        var svr = 'mt' + Math.floor(Math.random() * 4);
        var link = 'http://' + svr + '.google.com/'  + mapsuffix;
        link += '&x=' + xtile + '&y=' + ytile + '&z=' + (17 - zoom);
        // Security?
        link += '&s=' + 'Galileo'.substr(0, (xtile*3+ytile) % 8);
    } else if (maptype == 'map_terrain') {
        var svr = 'mt' + Math.floor(Math.random() * 4);
        var link = 'http://' + svr + '.google.com/'  + mapsuffix;
        link += '&x=' + xtile + '&y=' + ytile + '&z=' + (17 - zoom);
        // Security?
        link += '&s=' + 'Galileo'.substr(0, (xtile*3+ytile) % 8);
    } else if (maptype == 'map_pgweb') {
        var link = 'http://maps.pgweb.cz/elev/';
        link += (17-zoom) + '/' + xtile + '/' + ytile;
    } else if (maptype == 'map_airspace') {
        var link = 'http://maps.pgweb.cz/airspace/';
        link += (17-zoom) + '/' + xtile + '/' + ytile;
    } else if (maptype == 'map_googlesat') {
        var svr = 'khm' + Math.floor(Math.random() * 4);
        var link = 'http://' + svr + '.google.com/' + mapsuffix;

        var zstring = '';
        for (var i=zoom; i < 17; i++) {
            var xmod = xtile % 2;
            var ymod = ytile % 2;
            
            xtile = Math.floor(xtile / 2);
            ytile = Math.floor(ytile / 2);
            
            if (xmod == 0 && ymod == 0)
                zstring = 'q' + zstring;
            else if (xmod == 1 && ymod == 0)
                zstring = 'r' + zstring;
            else if (xmod == 1 && ymod == 1)
                zstring = 's' + zstring;
            else
                zstring = 't' + zstring;
        }
        zstring = 't' + zstring;
        link += '&t=' + zstring;
    }
    return link;
};
