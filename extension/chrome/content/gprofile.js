htmlns = "http://www.w3.org/1999/xhtml";

// Profile strip object
function TracklogProfile(id, height) {
    var self = this;
    this.main = document.getElementById(id);
    this.main.style.backgroundColor = 'white';
    this.main.style.position = 'relative';
    this.main.style.overflow = 'hidden';
    this.main.style.height = height + 'px';
    
    this.canvas = document.createElementNS(htmlns, 'canvas');
    this.canvas.style.position = 'absolute';
    this.canvas.setAttribute('height', height);
    this.main.appendChild(this.canvas);
    
    this.resize = function(evt) {
        self.canvas.setAttribute('width', self.main.offsetWidth);
        self.draw();
    }
    this.resize();
    window.addEventListener('resize', this.resize, false);
    
    this.tracklog = null;
    // List of points given a coordinate inside canvas
    this.tpoints = new Array();
    // Saved image so that we can easily animate
    this.savedimage = null;
    // List of listeners
    this.eventhandlers = [];
    
    this.mousemove = function(evt) {
        var x = evt.clientX - findPosX(self.canvas);
        if (self.tpoints[x] == null)
            return;
        
        var ctx = self.canvas.getContext('2d');
        // Restore image data
        if (self.savedimage) {
            ctx.putImageData(self.savedimage, 0, 0);
        } else { // Save image data
            self.savedimage = ctx.getImageData(0, 0, self.canvas.width, self.canvas.height);
        }
        ctx.beginPath();
        ctx.strokeStyle = 'darkgrey';
        ctx.moveTo(x + 0.5, 0);
        ctx.lineTo(x + 0.5, self.canvas.height);
        ctx.stroke();
        
        // Fire events
        for (var i=0; i < self.eventhandlers.length; i++)
            self.eventhandlers[i](self.tracklog, self.tpoints[x]);
    }
    
    this.canvas.addEventListener('mousemove', this.mousemove, false);
}

// Add event handler to a handler queue
TracklogProfile.prototype.add_eventhandler = function(handler) {
    this.eventhandlers.push(handler);
}

// Compute maximum height that will be shown in profile
TracklogProfile.prototype.max_height = function() {
    var maxheight = this.tracklog.igcGetStat(this.tracklog.STAT_HEIGHT_MAX);
    var divider = 500;
    if (!get_bool_pref('metric'))
            divider = 457.2;
    return (Math.floor(maxheight / divider) + 1) * divider;
}

// Compute minimum height that will be shown in profile
TracklogProfile.prototype.min_height = function() {
    var maxheight = this.tracklog.igcGetStat(this.tracklog.STAT_HEIGHT_MIN);
    var divider = 500;
    if (!get_bool_pref('metric'))
            divider = 457.2;
    return (Math.floor(maxheight / divider)) * divider;
}

// Draw lines every 500m/1500ft
TracklogProfile.prototype.draw_heightlines = function(ctx, minheight, maxheight) {
    var scale = this.canvas.height / (maxheight - minheight);
    var divider = 500;
    if (!get_bool_pref('metric'))
            divider = 457.2; // 1500 ft

    for (var height=minheight; height <= maxheight; height += divider) {
        ctx.beginPath();
        var y = Math.floor(this.canvas.height - scale * (height - minheight));
        if (((height + 0.1) % (divider * 2)) > 1) {
            ctx.strokeStyle = '#b9b9b9';
        } else {
            ctx.strokeStyle = '#797979';
            ctx.fillStyle = 'black';
            ctx.textBaseline = 'top';
            ctxFillText(ctx, format_m(height), 0, y + 2);
        }
        ctx.moveTo(0, y + 0.5); // WHY??? we must do +0.5 to get a perfectly aligned line???
        ctx.lineTo(this.canvas.width, y + 0.5);
        ctx.stroke();
    }
}

// Draw time scale
TracklogProfile.prototype.draw_timelines = function(ctx, starttime, endtime) {
    var tscale = this.canvas.width / (endtime - starttime);

    var date = new Date(starttime);
    date.setUTCMinutes(0);
    date.setUTCSeconds(0);
    date.setUTCMilliseconds(0);
    date.setUTCHours(date.getUTCHours() + 1);
    
    var INTERVAL = 300 * 1000;
    var HOURSTICK = 10;
    var MINUTESTICK30 = 7;
    var MINUTESTICK5 = 4;
    
    var time = date.valueOf();
    // Whole hour
    var dhour = date.valueOf();
    for (time = date.valueOf(); time - INTERVAL > starttime; time -= INTERVAL)
        ;
    ctx.strokeStyle = 'black';
    for (; time < endtime; time += INTERVAL) {
        var x = Math.floor((time - starttime) * tscale) + 0.5;
        ctx.beginPath();
        ctx.moveTo(x, this.canvas.height);
        if (!((time - dhour) % (3600 * 1000))) {
            ctx.lineTo(x, this.canvas.height - HOURSTICK);
            ctx.fillStyle = '#4697c0';
            ctx.textBaseline = 'bottom';
            var acdate = new Date(time);
            var text = acdate.getUTCHours() + ':00';
            ctxFillText(ctx, text, x, this.canvas.height - MINUTESTICK30);
        } else if (!((time - dhour) % (1800 * 1000)))
            ctx.lineTo(x, this.canvas.height - MINUTESTICK30);
        else 
            ctx.lineTo(x, this.canvas.height - MINUTESTICK5);
        ctx.stroke();
    }
}

// Completely draw a profile
TracklogProfile.prototype.draw = function() {
    if (!this.tracklog)
        return;
    
    var tlog = this.tracklog;
    // Recompute this.tpoints on the fly
    this.tpoints = new Array();
    // Clear the saved image data
    this.savedimage = null;
    
    var maxheight = this.max_height();
    var minheight = this.min_height();
    
    var divider = 500;
    if (!get_bool_pref('metric'))
            divider = 457.2;
    if (maxheight - minheight < divider * 2) {
        if (minheight > 0)
            minheight = 0;
    }
    var ctx = this.canvas.getContext('2d');
    ctx.font = '7pt Arial';
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    ctx.strokeStyle = '#ff7901';
    ctx.fillStyle = 'lightgrey';

    var starttime = tlog.igcPoint(0).time;
    var endtime = tlog.igcPoint(tlog.igcPointCount() - 1).time;

    // Optimized drawing of tracklog on canvas
    // The callback function sets the indexes in a hash table for later
    // reference
    var self = this;
    var cbset = function(x,i) {self.tpoints[x] = i;};
    // Callback for filling tpoints with tracklog point indexes
    try {
        tlog.drawCanvasProfile(ctx, this.canvas.width, this.canvas.height,
                            minheight, maxheight, cbset);
    } catch (e) {
        // Probably FF 3.5 - fallback to javacript version
        this.drawCanvasProfile(tlog, ctx, minheight, maxheight, cbset);
    }

    // Draw top and bottom black lines
    ctx.strokeStyle = 'black';
    ctx.beginPath();ctx.moveTo(0, 0.5);ctx.lineTo(this.canvas.width, 0.5); ctx.stroke();
    ctx.beginPath();ctx.moveTo(0, this.canvas.height - 0.5);
    ctx.lineTo(this.canvas.width, this.canvas.height - 0.5); ctx.stroke();
    
    this.draw_heightlines(ctx, minheight, maxheight);
    this.draw_timelines(ctx, starttime, endtime);
}

// Javascript fallback function when ctx API for FF 3.6 is not available
TracklogProfile.prototype.drawCanvasProfile = function(tlog, ctx, minheight, maxheight, callback)
{
    var starttime = tlog.igcPoint(0).time;
    var endtime = tlog.igcPoint(tlog.igcPointCount() - 1).time;
    var timescale = this.canvas.width / (endtime - starttime);
    var scale = this.canvas.height / (maxheight - minheight);
    
    var lasttime = 0;
    var startx = 0;
    var lastx = 0;
    for (var i=0; i < tlog.igcPointCount(); i++) {
        var point = tlog.igcPoint(i);
        var x = Math.floor((point.time - starttime) * timescale);
        y = Math.floor(this.canvas.height - (point.alt - minheight) * scale);
        
        // Detect hole in tracklog
        if (point.time - lasttime > 60*1000) {
            if (lasttime) {
                ctx.stroke();
                ctx.lineTo(lastx, this.canvas.height);
                ctx.lineTo(startx, this.canvas.height);
                ctx.closePath();
                ctx.fill();
            }
            ctx.beginPath();
            ctx.moveTo(x, y);
            startx = x;
        }
        if (lastx != x) {
            ctx.lineTo(x, y);
            callback(x, i);
        }
        lasttime = point.time;
        lastx = x;
    }
    ctx.stroke();
    ctx.lineTo(this.canvas.width, this.canvas.height);
    ctx.lineTo(startx, this.canvas.height);
    ctx.closePath();
    ctx.fill();
}

// Set new tracklog to a profile
TracklogProfile.prototype.set_tracklog = function(tracklog) {
    this.tracklog = tracklog;
    this.draw();
}
