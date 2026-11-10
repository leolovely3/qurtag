package app.impactconsultingai.qurtag;

import android.graphics.Color;
import android.graphics.drawable.ColorDrawable;
import android.view.View;
import android.view.ViewParent;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** Lets the page colour the strip behind the system bars (the app draws edge to edge, so the
 *  window behind the page shows there) and pick dark or light bar icons to match the page's
 *  light or dark mode (setAndroidBars in src/lib/platform.ts). */
@CapacitorPlugin(name = "AndroidBars")
public class AndroidBarsPlugin extends Plugin {
    @PluginMethod
    public void set(final PluginCall call) {
        final String color = call.getString("color", "#FFFFFF");
        final boolean darkIcons = Boolean.TRUE.equals(call.getBoolean("darkIcons", true));
        getActivity().runOnUiThread(() -> {
            try {
                int c = Color.parseColor(color);
                getActivity().getWindow().setBackgroundDrawable(new ColorDrawable(c));
                ViewParent parent = getBridge().getWebView().getParent();
                if (parent instanceof View) ((View) parent).setBackgroundColor(c);
                WindowInsetsControllerCompat bars = WindowCompat.getInsetsController(
                    getActivity().getWindow(), getActivity().getWindow().getDecorView());
                bars.setAppearanceLightStatusBars(darkIcons);
                bars.setAppearanceLightNavigationBars(darkIcons);
                call.resolve(new JSObject());
            } catch (Exception e) {
                call.reject("bad color");
            }
        });
    }
}
