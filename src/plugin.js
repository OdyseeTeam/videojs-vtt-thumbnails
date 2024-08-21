import videojs from 'video.js';

const defaults = {};
const cache = {};

const onPlayerReady = function(player, options) {
  player.addClass('vjs-vtt-thumbnails');
  player.vttThumbnailsPlugin = new VttThumbnailsPlugin(player, options);
};

const vttThumbnails = function(options) {
  this.ready(() => {
    onPlayerReady(this, videojs.mergeOptions(defaults, options));
  });
};

function VttThumbnailsPlugin(player, options) {
  this.player = player;
  this.options = options;
  this.listenForDurationChange();
  this.initializeThumbnails();
  this.registeredEvents = {};
}

VttThumbnailsPlugin.prototype.src = function(source) {
  this.resetPlugin();
  this.options.src = source;
  this.initializeThumbnails();
};

VttThumbnailsPlugin.prototype.detach = function() {
  this.resetPlugin();
};

VttThumbnailsPlugin.prototype.resetPlugin = function() {
  if (this.thumbnailHolder) {
    this.thumbnailHolder.parentNode.removeChild(this.thumbnailHolder);
  }

  if (this.progressBar) {
    this.progressBar.removeEventListener('mouseenter', this.registeredEvents.progressBarMouseEnter);
    this.progressBar.removeEventListener('mouseleave', this.registeredEvents.progressBarMouseLeave);
    this.progressBar.removeEventListener('mousemove', this.registeredEvents.progressBarMouseMove);
  }

  delete this.registeredEvents.progressBarMouseEnter;
  delete this.registeredEvents.progressBarMouseLeave;
  delete this.registeredEvents.progressBarMouseMove;
  delete this.progressBar;
  delete this.vttData;
  delete this.thumbnailHolder;
  delete this.lastStyle;
};

VttThumbnailsPlugin.prototype.listenForDurationChange = function() {
  this.player.on('durationchange', () => {});
};

VttThumbnailsPlugin.prototype.initializeThumbnails = function() {
  if (!this.options.src) {
    return;
  }

  const baseUrl = this.getBaseUrl();
  const url = this.getFullyQualifiedUrl(this.options.src, baseUrl);

  this.getVttFile(url)
    .then((data) => {
      this.vttData = this.processVtt(data);
      this.setupThumbnailElement();
    });
};

VttThumbnailsPlugin.prototype.getBaseUrl = function() {
  return [
    window.location.protocol,
    '//',
    window.location.hostname,
    window.location.port ? ':' + window.location.port : '',
    window.location.pathname
  ].join('').split(/([^\/]*)$/gi).shift();
};

VttThumbnailsPlugin.prototype.getVttFile = function(url) {
  return new Promise((resolve, reject) => {
    const req = new XMLHttpRequest();
    req.data = { resolve };
    req.addEventListener('load', function() {
      this.data.resolve(this.responseText);
    });
    req.open('GET', url);
    req.overrideMimeType('text/plain; charset=utf-8');
    req.send();
  });
};

VttThumbnailsPlugin.prototype.setupThumbnailElement = function() {
  let mouseDisplay = null;

  if (!this.options.showTimestamp) {
    mouseDisplay = this.player.$('.vjs-mouse-display');
  }

  const thumbHolder = document.createElement('div');
  thumbHolder.setAttribute('class', 'vjs-vtt-thumbnail-display');
  this.progressBar = this.player.$('.vjs-progress-control');
  this.progressBar.appendChild(thumbHolder);
  this.thumbnailHolder = thumbHolder;

  if (mouseDisplay && !this.options.showTimestamp) {
    mouseDisplay.classList.add('vjs-hidden');
  }

  this.registeredEvents.progressBarMouseEnter = () => this.onBarMouseenter();
  this.registeredEvents.progressBarMouseLeave = () => this.onBarMouseleave();

  this.progressBar.addEventListener('mouseenter', this.registeredEvents.progressBarMouseEnter);
  this.progressBar.addEventListener('mouseleave', this.registeredEvents.progressBarMouseLeave);
};

VttThumbnailsPlugin.prototype.onBarMouseenter = function() {
  this.mouseMoveCallback = (e) => this.onBarMousemove(e);
  this.registeredEvents.progressBarMouseMove = this.mouseMoveCallback;
  this.progressBar.addEventListener('mousemove', this.registeredEvents.progressBarMouseMove);
  this.showThumbnailHolder();
};

VttThumbnailsPlugin.prototype.onBarMouseleave = function() {
  if (this.registeredEvents.progressBarMouseMove) {
    this.progressBar.removeEventListener('mousemove', this.registeredEvents.progressBarMouseMove);
  }
  this.hideThumbnailHolder();
};

VttThumbnailsPlugin.prototype.getXCoord = function(bar, mouseX) {
  const rect = bar.getBoundingClientRect();
  return mouseX - (rect.left + (window.pageXOffset || document.documentElement.scrollLeft || 0));
};

VttThumbnailsPlugin.prototype.onBarMousemove = function(event) {
  this.updateThumbnailStyle(
    videojs.dom.getPointerPosition(this.progressBar, event).x,
    this.progressBar.offsetWidth
  );
};

VttThumbnailsPlugin.prototype.getStyleForTime = function(time) {
  for (let i = 0; i < this.vttData.length; ++i) {
    const item = this.vttData[i];

    if (time >= item.start && time < item.end) {
      if (item.css.url && !cache[item.css.url]) {
        const image = new Image();
        image.src = item.css.url;
        cache[item.css.url] = image;
      }
      return item.css;
    }
  }
};

VttThumbnailsPlugin.prototype.showThumbnailHolder = function() {
  this.thumbnailHolder.style.visibility = 'visible';
};

VttThumbnailsPlugin.prototype.hideThumbnailHolder = function() {
  this.thumbnailHolder.style.visibility = 'hidden';
};

VttThumbnailsPlugin.prototype.updateThumbnailStyle = function(percent, width) {
  const duration = this.player.duration();
  const time = percent * duration;
  const currentStyle = this.getStyleForTime(time);

  if (!currentStyle) {
    return this.hideThumbnailHolder();
  }

  const xPos = percent * width;
  const thumbnailWidth = parseInt(currentStyle.width, 10);
  const halfthumbnailWidth = thumbnailWidth >> 1;
  const marginRight = width - (xPos + halfthumbnailWidth);
  const marginLeft = xPos - halfthumbnailWidth;

  if (width < thumbnailWidth) {
    this.thumbnailHolder.style.left = (thumbnailWidth - width) / 2 * -1 + 'px';
  } else if (marginLeft > 0 && marginRight > 0) {
    this.thumbnailHolder.style.left = (xPos - halfthumbnailWidth) + 'px';
  } else if (marginLeft <= 0) {
    this.thumbnailHolder.style.left = 0 + 'px';
  } else if (marginRight <= 0) {
    this.thumbnailHolder.style.left = (width - thumbnailWidth) + 'px';
  }

  if (this.lastStyle && this.lastStyle === currentStyle) {
    return;
  }

  this.lastStyle = currentStyle;

  for (const style in currentStyle) {
    if (currentStyle.hasOwnProperty(style)) {
      this.thumbnailHolder.style[style] = currentStyle[style];
    }
  }
};

VttThumbnailsPlugin.prototype.processVtt = function(data) {
  const processedVtts = [];
  data = data.replace(/\r\n/g, '\n');
  const vttDefinitions = data.split(/[\r\n][\r\n]/i);

  vttDefinitions.forEach((vttDef) => {
    if (vttDef.match(/([0-9]{2}:)?([0-9]{2}:)?[0-9]{2}(.[0-9]{3})?( ?--> ?)([0-9]{2}:)?([0-9]{2}:)?[0-9]{2}(.[0-9]{3})?[\r\n]{1}.*/gi)) {
      const vttDefSplit = vttDef.split(/[\r\n]/i);
      const vttTiming = vttDefSplit[0];
      const vttTimingSplit = vttTiming.split(/ ?--> ?/i);
      const vttTimeStart = vttTimingSplit[0];
      const vttTimeEnd = vttTimingSplit[1];
      const vttImageDef = vttDefSplit[1];
      const vttCssDef = this.getVttCss(vttImageDef);

      processedVtts.push({
        start: this.getSecondsFromTimestamp(vttTimeStart),
        end: this.getSecondsFromTimestamp(vttTimeEnd),
        css: vttCssDef
      });
    }
  });

  return processedVtts;
};

VttThumbnailsPlugin.prototype.getFullyQualifiedUrl = function(path, base) {
  if (path.indexOf('//') >= 0) {
    return path;
  }

  if (base.indexOf('//') === 0) {
    return [
      base.replace(/\/$/gi, ''),
      this.trim(path, '/')
    ].join('/');
  }

  if (base.indexOf('//') > 0) {
    return [
      this.trim(base, '/'),
      this.trim(path, '/')
    ].join('/');
  }

  return path;
};

VttThumbnailsPlugin.prototype.getPropsFromDef = function(def) {
  const imageDefSplit = def.split(/#xywh=/i);
  const imageUrl = imageDefSplit[0];
  const imageCoords = imageDefSplit[1];
  const splitCoords = imageCoords.match(/[0-9]+/gi);

  return {
    x: splitCoords[0],
    y: splitCoords[1],
    w: splitCoords[2],
    h: splitCoords[3],
    image: imageUrl
  };
};

VttThumbnailsPlugin.prototype.getVttCss = function(vttImageDef) {
  const cssObj = {};
  let baseSplit;

  if (this.options.src.indexOf('//') >= 0) {
    baseSplit = this.options.src.split(/([^\/]*)$/gi).shift();
  } else {
    baseSplit = this.getBaseUrl() + this.options.src.split(/([^\/]*)$/gi).shift();
  }

  if (vttImageDef) {
    const imgDef = this.getPropsFromDef(vttImageDef);

    cssObj['background-image'] = 'url(' + this.getFullyQualifiedUrl(imgDef.image, baseSplit) + ')';
    cssObj['background-position'] = '-' + imgDef.x + 'px -' + imgDef.y + 'px';
    cssObj['background-size'] = imgDef.w + 'px ' + imgDef.h + 'px';
    cssObj['width'] = this.options.thumbnailWidth || imgDef.w + 'px';
    cssObj['height'] = this.options.thumbnailHeight || imgDef.h + 'px';
  }

  return cssObj;
};

VttThumbnailsPlugin.prototype.getSecondsFromTimestamp = function(timestamp) {
  const timeParts = timestamp.split(':');
  let seconds = 0;
  let multiplier = 1;

  for (let i = timeParts.length - 1; i >= 0; --i) {
    seconds += parseInt(timeParts[i], 10) * multiplier;
    multiplier *= 60;
  }

  return seconds;
};

VttThumbnailsPlugin.prototype.trim = function(str, char) {
  const trimmedStr = str.replace(new RegExp('^' + char + '+', 'g'), '');
  return trimmedStr.replace(new RegExp(char + '+$', 'g'), '');
};

videojs.registerPlugin('vttThumbnails', vttThumbnails);
export default vttThumbnails;
