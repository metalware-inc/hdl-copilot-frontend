const path = require('path');
const fs = require('fs');

export function isExcludedImpl(uriPath: any, configObj: any) {
    if (!configObj.excludePaths) {
        return false;
    }

    // Normalize the input path
    uriPath = path.normalize(uriPath);
    // Capitalize first letter
    if (uriPath.length > 0) {
        uriPath = uriPath.charAt(0).toUpperCase() + uriPath.slice(1);
    }
    
    if (!fs.existsSync(uriPath)) {
        return false;
    }

    // Append system-specific path separator if the path is a directory and it doesn't end with one
    if (fs.lstatSync(uriPath).isDirectory() && !uriPath.endsWith(path.sep)) {
        uriPath += path.sep;
    }

    for (let i = 0; i < configObj.excludePaths.length; i++) {
        let excludedPath = configObj.excludePaths[i];
        excludedPath = path.normalize(excludedPath);

        // Append system-specific path separator to excludedPath if it is a directory and doesn't end with one
        if (fs.lstatSync(excludedPath).isDirectory() && !excludedPath.endsWith(path.sep)) {
            excludedPath += path.sep;
        }

        // Check if the uriPath is a child of an excludedPath
        if (uriPath.startsWith(excludedPath)) {
            return true;
        }
    }
    return false;
}