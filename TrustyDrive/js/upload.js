﻿/***
*   uploadComplete: call this function after uploading one chunk
*       file: the file metadata
***/
function uploadComplete(file) {
    const month = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Nov', 'Dec'];
    var idx, d = new Date(), filetype = 'unknown';
    if (file.name == g_metadataName) {
        setTimeout(function () {
            var myfile = g_file2display;
            g_file2display = undefined;
            if (myfile == undefined) {
                if ($('.user-interface').is(':visible')) {
                    $('.user-interface').hide();
                }
            } else if (myfile == 'login') {
                WinJS.Navigation.navigate('/pages/login/login.html', '');
            } else {
                if (myfile.files == undefined) {
                    // Display a file
                    WinJS.Navigation.navigate('/pages/file/file.html', { 'file': myfile, 'folder': getFolder(myfile) });
                } else {
                    // Display a folder
                    WinJS.Navigation.navigate('/pages/folder/folder.html', myfile);
                }
            }
        }, 1000);
    } else {
        // Display this file after uploading the metadata
        g_file2display = file;
        // Update the last upload date
        file['lastupload'] = d.getDate() + '-' + month[d.getMonth()] + '-' + d.getFullYear().toString().substr(-2) + ' ';
        if (d.getMinutes() > 9) {
            file['lastupload'] += d.getHours() + ':' + d.getMinutes();
        } else {
            file['lastupload'] += d.getHours() + ':0' + d.getMinutes();
        }
        // Compute the file type
        idx = file.name.indexOf('.');
        if (idx > -1) {
            switch (file.name.substr(idx + 1)) {
                case '7z':
                case 'tar':
                case 'tar.gz':
                case 'zip':
                    filetype = 'archive';
                    break;
                case 'mp3':
                case 'wav':
                case 'ogg':
                case 'flac':
                    filetype = 'music';
                    break;
                case 'pdf':
                    filetype = 'pdf';
                    break;
                case 'bmp':
                case 'gif':
                case 'ico':
                case 'jpg':
                case 'nef':
                case 'png':
                    filetype = 'picture';
                    break;
                case 'c':
                case 'js':
                case 'py':
                case 'sh':
                case 'bat':
                    filetype = 'script';
                    break;
                case 'odp':
                case 'ods':
                case 'odt':
                case 'ppt':
                case 'txt':
                case 'xls':
                    filetype = 'text';
                    break;
                case 'avi':
                case 'mp4':
                    filetype = 'video';
                    break;
                case 'html':
                case 'htm':
                case 'php':
                    filetype = 'web';
                    break;
                case 'dll':
                case 'exe':
                    filetype = 'system';
                    break;
            }
        }
        // End of the file type definition
        file['type'] = filetype;
        setTimeout(uploadMetadata, 1000);
    }
}

/***
*   uploadChunks: compute the number of chunks required to upload one file
*       filename: the name of the file
*       folder: the folder that will contain the file in TrustyDrive
*       readStream: the stream opened from the file to upload
***/
function uploadChunks(filename, folder, readStream) {
    var file, nbChunks, nbProviders = g_providers.length;
    if (g_files[filename] == undefined) {
        // Initialize the file metadata
        file = createElement(filename, 'file');
        addToFolder(folder, file);
    } else {
        file = g_files[filename];
    }
    // The minimal file size required, 3 bytes on every provider
    if (readStream.size < nbProviders * 3) {
        readStream.close();
        throw "The file is too small. Required size: " + nbProviders * 3;
        WinJS.Navigation.navigate('/pages/login/login.html', 'The file is too small. Required minimal size: ' + nbProviders * 3);
    }
    // Compute the number of chunks per provider
    nbChunks = Math.ceil(readStream.size / g_maxChunkSize / g_providers.length);
    file['size'] = readStream.size;
    file['nb_chunks'] = nbChunks * g_providers.length;
    if (file.nb_chunks > g_maxFileChunks) {
        // Display the error: the file is too large
        var body = $('.interface-body');
        var maxSize = sizeString(g_maxFileChunks * g_maxChunkSize);
        div = $('<div id="close-button" class="interface-button">CLOSE</div>');
        div.click(function () {
            $('.user-interface').hide();
        });
        body.empty();
        body.append('<b>This file is too large</b>. ' +
            'The maximum file size is ' + maxSize.value + ' ' + maxSize.unit + '<br><br>');
        body.append(div);
        $('.user-interface').show();
    } else {
        if (file.name == g_metadataName) {
            // Metadata = 1 chunk per provider
            if (file.nb_chunks > g_providers.length) {
                readStream.close();
                WinJS.Navigation.navigate('/pages/login/login.html', 'The maximum number of files is reached. You can not upload new files!');
            } else {
                startUpload(file, readStream);
            }
        } else {
            // Check the number of providers
            if (file.chunks.length < nbProviders) {
                g_providers.forEach(function (p) {
                    var notfound = file.chunks.every(function (c) {
                        if (c.provider.name == p.name && c.provider.user == p.user) {
                            return false;
                        } else {
                            return true;
                        }
                    });
                    if (notfound) {
                        file.chunks.push({ 'provider': p, 'info': [] });
                    }
                });
            }
            // Fill the file structure with the right number of chunks
            removeChunks(file, readStream, nbChunks, folder);
        }
    }
}

/***
*   removeChunks: remove the chunks that are no longer required
*       file: the file metadata
*       readStream: the stream opened from the file to upload
*       nbChunks: the number of chunks required per provider
*       folder: the folder to display after uploading the file
***/
function removeChunks(file, readStream, nbChunks, folder) {
    var removed = [];
    file.chunks.forEach(function (c) {
        var temp;
        if (c.info.length > nbChunks) {
            temp = c.info.splice(nbChunks, c.info.length - nbChunks);
            temp.forEach(function (t) {
                removed.push({ 'provider': c.provider, 'name': t.name, 'id': t.id });
            });
        }
    });
    if (removed.length == 0) {
        // No chunk to delete
        addChunks(file, readStream, nbChunks, folder);
    } else {
        // Delete useless chunks
        g_complete = 0;
        progressBar(g_complete, removed.length + 1, 'Initialization', 'Delete Outdated Chunks');
        removed.forEach(function (r) {
            switch (r.provider.name) {
                case 'dropbox':
                    setTimeout(function () {
                        dropboxDelete(r.name, r.provider, removed.length, function () {
                            addChunks(file, readStream, nbChunks, folder);
                        });
                    }, 500);
                    break;
                case 'gdrive':
                    setTimeout(function () {
                        gdriveDelete(r.id, r.provider, removed.length, function () {
                            addChunks(file, readStream, nbChunks, folder);
                        });
                    }, 500);
                    break;
                case 'onedrive':
                    setTimeout(function () {
                        oneDriveDelete(r.id, r.provider, removed.length, function () {
                            addChunks(file, readStream, nbChunks, folder);
                        });
                    }, 500);
                    break;
            }
        });
    }
}

/***
*   addChunks: create chunk information to upload the file
*       file: the file metadata
*       readStream: the stream opened from the file to upload
*       nbChunks: the number of chunks required per provider
*       folder: the folder to display after uploading the file
***/
function addChunks(file, readStream, nbChunks, folder) {
    // Compute all existing chunk names
    var existingChunks = [];
    $.each(g_files, function (useless, file) {
        file.chunks.forEach(function (c) {
            c.info.forEach(function (i) {
                existingChunks.push(i.name);
            });
        });
    });
    // Generate chunk names that look like a SHA1, i.e., 40 random hexa chars
    file.chunks.forEach(function (c) {
        var j, chunkName;
        while (c.info.length < nbChunks) {
            do {
                chunkName = '';
                for (j = 0; j < 40; j++) {
                    chunkName += Math.floor(Math.random() * 16).toString(16);
                }
            } while (existingChunks.indexOf(chunkName) > -1);
            c.info.push({ 'name': chunkName });
            existingChunks.push(chunkName);
        }
    });
    startUpload(file, readStream);
}

/***
*   startUpoad: start to upload chunks to cloud providers
*       file: the file metadata
*       readStream: the stream opened from the file to upload
***/
function startUpload(file, readStream) {
    //Check the size of the metadata with the file metadata
    if (prepareMetadata().length > g_providers.length * g_maxChunkSize) {
        // Display the error: too many files
        var body = $('.interface-body');
        div = $('<div id="close-button" class="interface-button">CLOSE</div>');
        div.click(function () {
            $('.user-interface').hide();
        });
        body.empty();
        body.append('<b>The maximum number of files is reached</b>. ' +
            'You have to register to new providers to increase the maximum number of files to upload!<br><br>');
        body.append(div);
        $('.user-interface').show();
    } else {
        progressBar(0, file.nb_chunks + 1, 'Initialization', 'Uploading the File ' + file.name);
        // Delay the chunk creation to display the progress bar
        setTimeout(function () {
            var uploader = new breaker.Instance();
            var chunkNameList = [], chunkIdList = [], providerNameList = [], providerTokenList = [], cloudFolderList = [];
            file2lists(file, chunkNameList, chunkIdList, providerNameList, providerTokenList, cloudFolderList);
            uploader.createChunks(chunkNameList, chunkIdList, providerNameList, providerTokenList, cloudFolderList, readStream, g_maxChunkSize);
            g_complete = [];
            setTimeout(function () {
                checkEncoding(uploader, file);
            }, 1000);
        }, 100);
    }
}

/***
*   checkEncoding: detect the end of the encoding process
*       encoder: the encoder instance that uploads the file
*       file: the metadata of the file
***/
function checkEncoding(uploader, file) {
    var resultMap = {};
    var failed = 0;
    // Remember the last time of updating the number of uploaded chunks
    if (g_complete.length < 2) {
        g_complete.push({ 'size': uploader.result.length, 'time': new Date().getTime() });
    } else {
        if (uploader.result.length > g_complete[0].size) {
            g_complete.splice(0, 1);
        } else {
            g_complete.splice(1, 1);
        }
        g_complete.push({ 'size': uploader.result.length, 'time': new Date().getTime() });
    }
    // A beautiful progress bar (upload status)
    progressBar(uploader.result.length, file.nb_chunks + 1, 'Number of Uploaded Chunks: ' + uploader.result.length, 'Uploading...');
    // FIX BUG: the counter of uploaded chunks stays stuck on a value close to the expected number of chunks (probably causes by concurrent access)
    if (g_complete.length == 2 && g_complete[1].time - g_complete[0].time > 10000) {
        // There is no uploaded chunks since 10s, give up the upload
        // Display an error message
        body = $('.interface-body');
        if (failed > 0) {
            body.append('<span class="error-message ">Upload failure! Sorry, we can not upload your file right now.' +
                ' Please try again in few minutes</span><br>Number of errors: ' + failed + '<br><br>');
        } else {
            body.append('<span class="error-message ">Upload failure! Sorry, we can not upload your file right now.' +
                ' Please try again in few minutes</span><br><br>');
        }
        div = $('<div id="close-button" class="interface-button">CLOSE</div>');
        div.click(function () {
            $('.user-interface').hide();
        });
        body.append(div);
    } else {
        if (file.nb_chunks == uploader.result.length) {
            // The upload is complete, check the state of every chunk
            uploader.result.forEach(function (r) {
                var result = r.split(':$$:');
                if (result.length == 2) {
                    if (result[1] == 'error') {
                        failed++;
                    } else {
                        resultMap[result[0]] = result[1];
                    }
                }
            });
            if (failed > 0) {
                // Display an error message
                body = $('.interface-body');
                body.append('<span class="error-message ">Upload failure! Sorry, we can not upload your file right now.' +
                    ' Please try again in few minutes</span><br>Number of errors: ' + failed + '<br><br>');
                div = $('<div id="close-button" class="interface-button">CLOSE</div>');
                div.click(function () {
                    $('.user-interface').hide();
                });
                body.append(div);
            } else {
                // Record ID for Google Drive chunks
                file.chunks.forEach(function (c) {
                    c.info.forEach(function (i) {
                        if (resultMap[i.name] != undefined) {
                            i.id = resultMap[i.name];
                        }
                    });
                });
                uploadComplete(file);
            }
        } else {
            // Continue to wait the end of the upload
            setTimeout(function () {
                checkEncoding(uploader, file)
            }, 2000);
        }
    }
}

function prepareMetadata() {
    var metadata, crypto, cBuffer, buffer;
    // Build data from the metadata
    metadata = $.extend(true, {}, g_files);
    $.each(metadata, function (filename, file) {
        if (filename == g_metadataName) {
            // Remove password from the metadata
            metadata[filename] = { 'name': g_metadataName };
        } else {
            // Remove tokens from providers
            file.chunks.forEach(function (c) {
                c.provider = { 'name': c.provider.name, 'user': c.provider.user };
                c.info.forEach(function (i) {
                    delete i.exists;
                });
            });
        }
    });
    // Build the JSON
    metadata = JSON.stringify(metadata);
    crypto = Windows.Security.Cryptography;
    cBuffer = crypto.CryptographicBuffer;
    // Convert to buffer
    buffer = cBuffer.convertStringToBinary(metadata, crypto.BinaryStringEncoding.utf8);
    // Encrypt metadata data
    metadata = cBuffer.encodeToBase64String(buffer);
    buffer = cBuffer.convertStringToBinary(metadata, crypto.BinaryStringEncoding.utf8);
    return buffer;
}

/***
*   uploadMetadata: build, encrypt and upload the metadata
***/
function uploadMetadata() {
    var readStream;
    // Check the number of providers
    if (g_providers.length < 2) {
        WinJS.Navigation.navigate('/pages/addprovider/addprovider.html');
    } else {
        // Save the metadata to the cloud
        readStream = new Windows.Storage.Streams.InMemoryRandomAccessStream();
        readStream.writeAsync(prepareMetadata()).done(function () {
            // Synchronize the provider list and the metadata chunks
            $.each(g_providers, function (idx, p) {
                // Check the metadata chunks
                var metadataChunks = g_files[g_metadataName].chunks;
                if (idx == metadataChunks.length) {
                    metadataChunks.push({ 'provider': p, 'info': [{ 'name': metadataChunkName(p) }] });
                } else {
                    if (!(metadataChunks[idx].provider.name == p.name && metadataChunks[idx].provider.user == p.user)) {
                        // Insert a new chunk for this provider
                        metadataChunks.splice(idx, 0, { 'provider': p, 'info': [{ 'name': metadataChunkName(p) }] });
                    }
                }
            });
            uploadChunks(g_metadataName, undefined, readStream);
        });
    }
}

/***
*   uploadFile: select and upload one file
*       folder: the folder that will contain the file
***/
function uploadFile(folder) {
    // Verify that we are currently not snapped, or that we can unsnap to open the picker
    var currentState = Windows.UI.ViewManagement.ApplicationView.value;
    var filePicker = new Windows.Storage.Pickers.FileOpenPicker();
    if (currentState === Windows.UI.ViewManagement.ApplicationViewState.snapped &&
        !Windows.UI.ViewManagement.ApplicationView.tryUnsnap()) {
        // Fail silently if we can't unsnap
        return;
    }
    // Create the picker object and set options
    filePicker.viewMode = Windows.Storage.Pickers.PickerViewMode.thumbnail;
    filePicker.suggestedStartLocation = Windows.Storage.Pickers.PickerLocationId.picturesLibrary;
    // Users expect to have a filtered view of their folders depending on the scenario.
    // For example, when choosing a documents folder, restrict the filetypes to documents for your application.
    filePicker.fileTypeFilter.replaceAll(['*']);
    // Open the picker for the user to pick a file
    filePicker.pickSingleFileAsync().then(function (file) {
        var existing;
        if (file) {
            // Application now has read/write access to the picked file
            existing = g_files[file.name];
            if (existing != undefined) {
                var html = '<div class="interface-question">';
                html += 'The file <b>' + file.name + '</b> already exists in <b>' + g_homeFolderName + existing.path + '</b>!<br>';
                html += 'This action will overwrite the existing file. Would you like to upload a new version of this file?<br>';
                html += '<br><br><div id="upload-button" class="interface-button">UPLOAD</div>' +
                    '<div id="cancel-button" class="interface-button">CANCEL</div>';
                html += '</div>';
                $('.interface-body').empty();
                $('.user-interface').show();
                $('.interface-body').append(html);
                $('#upload-button').click(function () {
                    file.openReadAsync().done(function (readStream) {
                        uploadChunks(file.name, folder, readStream);
                    });
                });
                $('#cancel-button').click(function () {
                    $('.user-interface').hide();
                });
            } else {
                file.openReadAsync().done(function (readStream) {
                    uploadChunks(file.name, folder, readStream);
                });
            }
        }
    });
}
