package com.blocksmith.studio;

import android.content.ContentValues;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.OutputStream;
import java.util.Locale;
import java.util.regex.Pattern;

@CapacitorPlugin(name = "GummyBearsStorage")
public class GummyBearsStoragePlugin extends Plugin {
    private static final Pattern SAFE_FILENAME = Pattern.compile("[A-Za-z0-9._-]{1,100}\\.mcaddon", Pattern.CASE_INSENSITIVE);

    @PluginMethod
    public void saveAddon(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
            call.reject("Saving to the public Downloads folder requires Android 10 or later.");
            return;
        }

        String filename = call.getString("filename");
        String encodedData = call.getString("data");
        if (filename == null || !SAFE_FILENAME.matcher(filename).matches()) {
            call.reject("Invalid add-on filename.");
            return;
        }
        if (encodedData == null || encodedData.isEmpty()) {
            call.reject("No add-on data was provided.");
            return;
        }

        Uri itemUri = null;
        try {
            byte[] bytes = Base64.decode(encodedData, Base64.DEFAULT);
            ContentValues values = new ContentValues();
            values.put(MediaStore.Downloads.DISPLAY_NAME, filename);
            values.put(MediaStore.Downloads.MIME_TYPE, "application/vnd.minecraft.addon");
            values.put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/GummyBears");
            values.put(MediaStore.Downloads.IS_PENDING, 1);

            Uri collection = MediaStore.Downloads.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY);
            itemUri = getContext().getContentResolver().insert(collection, values);
            if (itemUri == null) throw new IllegalStateException("Android could not create the download file.");

            try (OutputStream output = getContext().getContentResolver().openOutputStream(itemUri)) {
                if (output == null) throw new IllegalStateException("Android could not open the download file.");
                output.write(bytes);
                output.flush();
            }

            ContentValues ready = new ContentValues();
            ready.put(MediaStore.Downloads.IS_PENDING, 0);
            getContext().getContentResolver().update(itemUri, ready, null, null);

            JSObject result = new JSObject();
            result.put("filename", filename);
            result.put("path", "Download/GummyBears/" + filename);
            call.resolve(result);
        } catch (Exception error) {
            if (itemUri != null) {
                try { getContext().getContentResolver().delete(itemUri, null, null); } catch (Exception ignored) { }
            }
            call.reject("Could not save the add-on to Downloads: " + error.getMessage(), error);
        }
    }
}
