package com.evfuel.app;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.widget.RemoteViews;

import org.json.JSONObject;

import java.util.Locale;

/**
 * Widget "Verifica consumo": mostra km totali, km parziali, batteria attuale e kWh/100km.
 * Toccando un campo si apre una piccola finestra (InserisciValoreActivity) con la tastiera.
 * Toccando kWh/100km lo si inserisce (calcolo inverso: ricava km parziali e totali); toccando il titolo si azzerano i dati.
 */
public class ConsumoWidgetProvider extends AppWidgetProvider {

    static final String ACTION_AZZERA = "com.evfuel.app.CONSUMO_AZZERA";
    static final String K_KMTOT = "in_kmtot";
    static final String K_KMPARZ = "in_kmparz";
    static final String K_PCT = "in_pct";
    static final String K_KWH100 = "in_kwh100";

    @Override
    public void onUpdate(Context ctx, AppWidgetManager mgr, int[] ids) {
        for (int id : ids) aggiorna(ctx, mgr, id);
    }

    @Override
    public void onReceive(Context ctx, Intent intent) {
        super.onReceive(ctx, intent);
        if (intent != null && ACTION_AZZERA.equals(intent.getAction())) {
            azzera(ctx);
        }
    }

    static void azzera(Context ctx) {
        SharedPreferences sp = ctx.getSharedPreferences(EvfuelWidgetProvider.PREFS, Context.MODE_PRIVATE);
        sp.edit().remove(K_KMTOT).remove(K_KMPARZ).remove(K_PCT).remove(K_KWH100).remove(EvfuelWidgetProvider.RISULTATO).apply();
        aggiornaTutti(ctx);
        EvfuelWidgetProvider.aggiornaTutti(ctx);
    }

    static void aggiornaTutti(Context ctx) {
        try {
            AppWidgetManager mgr = AppWidgetManager.getInstance(ctx);
            int[] ids = mgr.getAppWidgetIds(new ComponentName(ctx, ConsumoWidgetProvider.class));
            for (int id : ids) aggiorna(ctx, mgr, id);
        } catch (Exception ignored) {
        }
    }

    // ---- dati ----

    static Double leggiNum(Context ctx, String chiave) {
        try {
            SharedPreferences sp = ctx.getSharedPreferences(EvfuelWidgetProvider.PREFS, Context.MODE_PRIVATE);
            String s = sp.getString(chiave, "");
            if (s == null || s.trim().isEmpty()) return null;
            return Double.parseDouble(s.trim().replace(',', '.'));
        } catch (Exception e) {
            return null;
        }
    }

    /** kmBase, pctDopo, batteria dell'ultima ricarica salvata (inviati dall'app). null se mancano. */
    static double[] base(Context ctx) {
        try {
            SharedPreferences sp = ctx.getSharedPreferences(EvfuelWidgetProvider.PREFS, Context.MODE_PRIVATE);
            String s = sp.getString(EvfuelWidgetProvider.CHIAVE, null);
            if (s == null) return null;
            JSONObject c = new JSONObject(s).optJSONObject("consumo");
            if (c == null) return null;
            double kmBase = c.optDouble("kmBase", 0);
            double pctDopo = c.optDouble("pctDopo", 0);
            double batteria = c.optDouble("batteria", 0);
            if (kmBase <= 0 || batteria <= 0) return null;
            return new double[]{kmBase, pctDopo, batteria};
        } catch (Exception e) {
            return null;
        }
    }

    /** Valori mostrati dal widget: {kmTot, kmParz, pct, kwh100}; null = vuoto.
     *  Se e' impostato kWh/100km (calcolo inverso) ricava km parziali e totali da batteria e ultima ricarica. */
    static Double[] valori(Context ctx) {
        double[] b = base(ctx);
        Double pct = leggiNum(ctx, K_PCT);
        Double kwhIn = leggiNum(ctx, K_KWH100);
        if (kwhIn != null) {
            Double kp = null, kt = null;
            if (b != null && pct != null && kwhIn > 0) {
                double kwhUsati = ((b[1] - pct) / 100.0) * b[2];
                if (kwhUsati >= 0) {
                    kp = (double) Math.round((kwhUsati / kwhIn) * 100.0);
                    kt = b[0] + kp;
                }
            }
            return new Double[]{kt, kp, pct, kwhIn};
        }
        Double kt = leggiNum(ctx, K_KMTOT);
        Double kp = leggiNum(ctx, K_KMPARZ);
        Double r = null;
        if (b != null && pct != null && kp != null && kp > 0) {
            double kwhUsati = ((b[1] - pct) / 100.0) * b[2];
            if (kwhUsati >= 0) r = (kwhUsati / kp) * 100.0;
        }
        return new Double[]{kt, kp, pct, r};
    }

    static Double calcolaKwh100(Context ctx) {
        return valori(ctx)[3];
    }

    /** Tiene allineato il risultato mostrato dal widget "EVFuel" principale. */
    static void sincronizzaRisultato(Context ctx) {
        try {
            SharedPreferences sp = ctx.getSharedPreferences(EvfuelWidgetProvider.PREFS, Context.MODE_PRIVATE);
            Double r = calcolaKwh100(ctx);
            if (r == null) {
                sp.edit().remove(EvfuelWidgetProvider.RISULTATO).apply();
            } else {
                JSONObject o = new JSONObject();
                o.put("kwh100", r);
                Double[] v = valori(ctx);
                Double kt = v[0], kp = v[1], pc = v[2];
                o.put("kmTot", kt == null ? 0 : kt);
                o.put("kmParz", kp == null ? 0 : kp);
                o.put("pct", pc == null ? 0 : pc);
                sp.edit().putString(EvfuelWidgetProvider.RISULTATO, o.toString()).apply();
            }
        } catch (Exception ignored) {
        }
    }

    // ---- disegno ----

    private static String fmt(Double v, int dec) {
        if (v == null) return "\u2014";
        return String.format(Locale.ITALY, "%,." + dec + "f", v);
    }

    private static PendingIntent apriCampo(Context ctx, String campo, int codice) {
        Intent it = new Intent(ctx, InserisciValoreActivity.class);
        it.putExtra(InserisciValoreActivity.EXTRA_CAMPO, campo);
        it.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        return PendingIntent.getActivity(ctx, codice, it,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private static void aggiorna(Context ctx, AppWidgetManager mgr, int id) {
        try {
            RemoteViews rv = new RemoteViews(ctx.getPackageName(), R.layout.widget_consumo);

            Double[] v = valori(ctx);
            Double kt = v[0], kp = v[1], pc = v[2], ris = v[3];

            rv.setTextViewText(R.id.wc_kmtot, fmt(kt, 0));
            rv.setTextViewText(R.id.wc_kmparz, fmt(kp, 0));
            rv.setTextViewText(R.id.wc_pct, pc == null ? "\u2014" : fmt(pc, 0) + "%");
            rv.setTextViewText(R.id.wc_ris, fmt(ris, 1));

            double[] b = base(ctx);
            rv.setTextViewText(R.id.wc_titolo, b == null
                    ? "\uD83D\uDD0D Apri EVFuel per caricare i dati"
                    : String.format(Locale.ITALY, "\uD83D\uDD0D Verifica consumo \u00B7 da %,.0f km (%.0f%%)", b[0], b[1]));

            rv.setOnClickPendingIntent(R.id.wc_kmtot, apriCampo(ctx, "kmtot", 11));
            rv.setOnClickPendingIntent(R.id.wc_kmparz, apriCampo(ctx, "kmparz", 12));
            rv.setOnClickPendingIntent(R.id.wc_pct, apriCampo(ctx, "pct", 13));

            rv.setOnClickPendingIntent(R.id.wc_ris, apriCampo(ctx, "kwh100", 15));

            // tocco sul titolo -> azzera i dati inseriti
            Intent az = new Intent(ctx, ConsumoWidgetProvider.class);
            az.setAction(ACTION_AZZERA);
            rv.setOnClickPendingIntent(R.id.wc_titolo, PendingIntent.getBroadcast(ctx, 14, az,
                    PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE));

            mgr.updateAppWidget(id, rv);
        } catch (Exception ignored) {
        }
    }
}
