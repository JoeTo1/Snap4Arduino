/*
    Changes to WorldMorph for managing Snap4Arduino functions
*/

/**
 * Global object (world.Arduino) used for s4a/arduino properties
 */
WorldMorph.prototype.Arduino = {
    firmata : require('firmata'),
    portList : [],
    usedPorts : []
};

WorldMorph.prototype.originalInit = WorldMorph.prototype.init;
WorldMorph.prototype.init = function (aCanvas, fillPage) {
    this.originalInit(aCanvas, fillPage);

    // We need to override reportVersion and queryFirmware so that, in the event that the
    // cable is unplugged during a connection attempt, it does not try to write to the serial.
    // For some reason, the chrome.serial API freezes the serial port forever otherwise.

    this.Arduino.firmata.prototype.originalReportVersion = this.Arduino.firmata.prototype.reportVersion;
    this.Arduino.firmata.prototype.reportVersion = function (callback) {
        if (this.transport.connectionId > 0) {
            this.originalReportVersion(callback);
        }
    };
    this.Arduino.firmata.prototype.originalQueryFirmware = this.Arduino.firmata.prototype.queryFirmware;
    this.Arduino.firmata.prototype.queryFirmware = function (callback) {
        if (this.transport.connectionId > 0) {
            this.originalQueryFirmware(callback);
        }
    };

}

/**
 * Locks the given port to prevent its use in other connections (until it is unlocked)
 */
WorldMorph.prototype.Arduino.lockPort = function (port) {
    var usedPorts = this.usedPorts;

    if (usedPorts.indexOf(port) === -1) {
        usedPorts.push(port);
    }
};

/**
 * Unlocks a previously Locked port to permit its use in new connections
 * Should be called when closing connections
 */
WorldMorph.prototype.Arduino.unlockPort = function (port) {
    var usedPorts = this.usedPorts;

    if (usedPorts.indexOf(port) > -1) {
        usedPorts.splice(usedPorts.indexOf(port));
    }
};

/**
 * Informs whether the port is locked or unlocked
 */
WorldMorph.prototype.Arduino.isPortLocked = function (port) {
    return (this.usedPorts.indexOf(port) > -1);
};


/**
 * Gets a list of available serial ports (paths) and return it through callback function
 */
WorldMorph.prototype.Arduino.getSerialPorts = function (callback) {
    var myself = this,
        portList = [],
        portcheck = /usb|DevB|rfcomm|acm|^com/i; // Not sure about rfcomm! We must dig further how bluetooth works in Gnu/Linux

    chrome.serial.getDevices(function (devices) { 
        if (devices) { 
            devices.forEach(function (device) { 
                if (!myself.isPortLocked(device.path) && portcheck.test(device.path)) {
                    portList[device.path] = device.path; 
                }
            });
        }
        callback(portList);
    });
    
};

WorldMorph.prototype.Arduino.transpile = function (body) {
    var lines = body.split('\n'),
        header = '/* ============================================\n'
               + ' *        AUTO-Generated by Snap4Arduino\n'
               + ' * ============================================\n'
               + ' *\n'
               + ' * Please review this sketch before pushing it.\n'
               + ' *\n'
               + ' * This is an experimental feature, and there\n'
               + ' * are _several_ Snap!-related functionalities\n'
               + ' * that are, by definition, untranslatable to\n'
               + ' * static, compiled languages.\n'
               + ' *\n'
               + ' * There is NO WARRANTY whatsoever that this\n'
               + ' * sketch is going to work exactly in the same\n'
               + ' * way as the original Snap4Arduino script.\n'
               + ' */\n\n',
        setupHeader = '',
        servoLines,
        servoPins,
        digitalOutputLines,
        digitalOutputPins,
        digitalInputLines,
        digitalInputPins;
    
    unique = function(anArray) {
        return anArray.filter(function(elem, pos) { 
            return anArray.indexOf(elem) == pos; 
        });
    }

    // let's find out what pins we are using, and for what purpose
    servoLines = lines.filter(function(each) { return each.match(/servo[0-9]*\.write/)} );
    servoPins = unique(servoLines.map(function(each) { return each.replace(/.*servo([0-9]*)\.write.*/g, '$1') }));

    digitalOutputLines = lines.filter(function(each) { return each.match(/digitalWrite/)});
    digitalOutputPins = unique(digitalOutputLines.map(function(each) { return each.replace(/.*digitalWrite\(([0-9]*),.*\).*/g, '$1') }));

    digitalInputLines = lines.filter(function(each) { return each.match(/digitalRead/)});
    digitalInputPins = unique(digitalInputLines.map(function(each) { return each.replace(/.*digitalRead\(([0-9]*)\).*/g, '$1') }));

    // now let's construct the program header and the setup header
    if (servoLines.length > 0) { header += '#include <Servo.h>\n\n' };

    servoPins.forEach( function(pin) { 
        header += 'Servo servo' + pin + ';\n'
        setupHeader += '\n  servo' + pin + '.attach(' + pin + ');'
    });

    // variables should be defined in the program header and taken out from setup
    varLines = body.match(/int .* = 0;/g);
    body = body.replace(/int .* = 0;\n/g, '');
    varLines.forEach(function (each) {
        header += each + '\n';
    });

    header += '\n';

    digitalOutputPins.forEach( function(pin){ setupHeader += '\n  pinMode(' + pin + ', OUTPUT);' });
    digitalInputPins.forEach( function(pin){ setupHeader += '\n  pinMode(' + pin + ', INPUT);' });

    // of course, if someone's named their vars this way, we've destroyed their project
    // sorry! :p
    body = body.replace('"clockwise"', 1200);
    body = body.replace('"stopped"', 1500);
    body = body.replace('"counter-clockwise"', 1700);

    // We add the setup header right after "void setup() {"
    body = body.replace('void setup() {', '$&' + setupHeader);

    if (body.indexOf('void loop()') < 0) {
        body += '\n}\n\nvoid loop() {}\n';
    }

    return header + body;
};
