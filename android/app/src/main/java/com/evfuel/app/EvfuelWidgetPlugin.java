package com.evfuel.app;

import android.content.Context;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** Ponte fra l'app (JavaScript) e il widget: salva i dati JSON e ridisegna il widget. */
@CapacitorPlugin(name = "EvfuelWidget")
public class EvfuelWidgetPlugin extends Plugin {

    @PluginMethod
    public void aggiorna(PluginCall call) {
        String json = call.getString("json");
        if (json == null) {
            call.reject("json mancante");
            return;
        }
        Context ctx = getContext();
        ctx.getSharedPreferences(EvfuelWidgetProvider.PREFS, Context.MODE_PRIVATE)
                .edit().putString(EvfuelWidgetProvider.CHIAVE, json).apply();
        EvfuelWidgetProvider.aggiornaTutti(ctx);
        call.resolve();
    }
}
