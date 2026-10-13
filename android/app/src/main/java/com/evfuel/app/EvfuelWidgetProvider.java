package com.evfuel.app;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.RectF;
import android.graphics.Typeface;
import android.os.Bundle;
import android.util.DisplayMetrics;
import android.widget.RemoteViews;

import org.json.JSONObject;

import java.util.Locale;

/**
 * Widget "EVFuel": costo e kWh del mese in corso + ultima ricarica.
 * Legge i dati salvati in SharedPreferences da EvfuelWidgetPlugin.
 */
public class EvfuelWidgetProvider extends AppWidgetProvider {

    static final String PREFS = "evfuel_widget";
    static final String CHIAVE = "data";
    static final String RISULTATO = "risultato";

    @Override
    public void onUpdate(Context ctx, AppWidgetManager mgr, int[] ids) {
        for (int id : ids) aggiorna(ctx, mgr, id);
    }

    @Override
    public void onAppWidgetOptionsChanged(Context ctx, AppWidgetManager mgr, int id, Bundle newOptions) {
        aggiorna(ctx, mgr, id);
    }

    @Override
    public void onReceive(Context ctx, Intent intent) {
        super.onReceive(ctx, intent);
        String a = intent == null ? null : intent.getAction();
        if (Intent.ACTION_DATE_CHANGED.equals(a)
                || Intent.ACTION_TIME_CHANGED.equals(a)
                || Intent.ACTION_TIMEZONE_CHANGED.equals(a)) {
            aggiornaTutti(ctx);
        }
    }

    static void aggiornaTutti(Context ctx) {
        try {
            AppWidgetManager mgr = AppWidgetManager.getInstance(ctx);
            int[] ids = mgr.getAppWidgetIds(new ComponentName(ctx, EvfuelWidgetProvider.class));
            for (int id : ids) aggiorna(ctx, mgr, id);
        } catch (Exception ignored) {
        }
    }

    private static void aggiorna(Context ctx, AppWidgetManager mgr, int id) {
        try {
            Bundle opt = mgr.getAppWidgetOptions(id);
            DisplayMetrics dm = ctx.getResources().getDisplayMetrics();
            float d = dm.density;
            int wDp = opt.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 250);
            int hDp = opt.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT, 110);
            if (wDp <= 0) wDp = 250;
            if (hDp <= 0) hDp = 110;
            int w = Math.round(wDp * d);
            int h = Math.round(hDp * d);
            while ((long) w * h > 1400000L) {
                w = w * 9 / 10;
                h = h * 9 / 10;
            }
            Bitmap bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
            disegna(ctx, new Canvas(bmp), w, h, d);

            RemoteViews rv = new RemoteViews(ctx.getPackageName(), R.layout.widget_evfuel);
            rv.setImageViewBitmap(R.id.widget_img, bmp);
            // tocco sul widget -> mini-finestra "Verifica consumo"
            Intent it = new Intent(ctx, VerificaConsumoActivity.class);
            it.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
            PendingIntent pi = PendingIntent.getActivity(ctx, 0, it,
                    PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            rv.setOnClickPendingIntent(R.id.widget_root, pi);
            mgr.updateAppWidget(id, rv);
        } catch (Exception ignored) {
        }
    }

    private static JSONObject leggi(Context ctx) {
        try {
            SharedPreferences sp = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
            String s = sp.getString(CHIAVE, null);
            return s == null ? null : new JSONObject(s);
        } catch (Exception e) {
            return null;
        }
    }

    private static JSONObject leggiRisultato(Context ctx) {
        try {
            SharedPreferences sp = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
            String s = sp.getString(RISULTATO, null);
            return s == null ? null : new JSONObject(s);
        } catch (Exception e) {
            return null;
        }
    }

    private static String eur(double v) {
        return String.format(Locale.ITALY, "\u20AC %,.2f", v);
    }

    private static String num(double v, int dec) {
        return String.format(Locale.ITALY, "%,." + dec + "f", v);
    }

    private static String entra(Paint p, String s, float maxW) {
        if (s == null || s.isEmpty()) return "";
        if (p.measureText(s) <= maxW) return s;
        float puntini = p.measureText("\u2026");
        int n = p.breakText(s, true, Math.max(0f, maxW - puntini), null);
        return n <= 0 ? "" : s.substring(0, n) + "\u2026";
    }

    private static void disegna(Context ctx, Canvas c, int w, int h, float d) {
        JSONObject root = leggi(ctx);
        int bg = 0xFF0A0F1E;
        int card = 0xFF141B2E;
        int txt = 0xFFE5E7EB;
        int sub = 0xFF9CA3AF;
        int verde = 0xFF22C55E;
        int azzurro = 0xFF38BDF8;

        Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
        p.setStyle(Paint.Style.FILL);
        p.setColor(bg);
        float raggio = 14f * d;
        c.drawRoundRect(new RectF(0, 0, w, h), raggio, raggio, p);

        if (root == null) {
            p.setColor(sub);
            p.setTextAlign(Paint.Align.CENTER);
            p.setTextSize(13f * d);
            c.drawText("Apri l'app EVFuel per caricare i dati", w / 2f, h / 2f, p);
            return;
        }

        JSONObject mese = root.optJSONObject("mese");
        JSONObject ult = root.optJSONObject("ultima");
        float pad = 10f * d;
        float x1 = pad, x2 = w - pad;
        float maxW = x2 - x1;

        // intestazione: EVFuel + mese
        p.setTypeface(Typeface.DEFAULT_BOLD);
        p.setTextAlign(Paint.Align.LEFT);
        p.setTextSize(11f * d);
        p.setColor(azzurro);
        float yHead = pad + 11f * d;
        c.drawText("\u26A1 EVFuel", x1, yHead, p);
        p.setTextAlign(Paint.Align.RIGHT);
        p.setColor(sub);
        c.drawText(mese != null ? mese.optString("label", "") : "", x2, yHead, p);

        // totale del mese
        double costo = mese != null ? mese.optDouble("costo", 0) : 0;
        double kwh = mese != null ? mese.optDouble("kwh", 0) : 0;
        int n = mese != null ? mese.optInt("n", 0) : 0;
        p.setTextAlign(Paint.Align.LEFT);
        p.setColor(verde);
        p.setTextSize(24f * d);
        float yCosto = yHead + 6f * d + 24f * d * 0.85f;
        c.drawText(eur(costo), x1, yCosto, p);
        p.setTypeface(Typeface.DEFAULT);
        p.setColor(sub);
        p.setTextSize(10.5f * d);
        String riga = n + (n == 1 ? " ricarica" : " ricariche") + " \u00B7 " + num(kwh, 1) + " kWh";
        c.drawText(entra(p, riga, maxW), x1, yCosto + 4f * d + 10.5f * d, p);

        // ultima verifica consumo (a destra)
        JSONObject ris = leggiRisultato(ctx);
        if (ris != null && ris.has("kwh100")) {
            p.setTypeface(Typeface.DEFAULT_BOLD);
            p.setTextAlign(Paint.Align.RIGHT);
            p.setColor(azzurro);
            p.setTextSize(22f * d);
            c.drawText(num(ris.optDouble("kwh100", 0), 1), x2, yCosto, p);
            p.setTypeface(Typeface.DEFAULT);
            p.setColor(sub);
            p.setTextSize(10.5f * d);
            c.drawText("kWh/100km", x2, yCosto + 4f * d + 10.5f * d, p);
            p.setTextAlign(Paint.Align.LEFT);
        }

        // ultima ricarica
        float top = yCosto + 4f * d + 10.5f * d + 8f * d;
        float bottom = h - pad;
        if (bottom - top < 22f * d) return;
        RectF r = new RectF(x1, top, x2, bottom);
        p.setColor(card);
        c.drawRoundRect(r, 8f * d, 8f * d, p);
        p.setTextAlign(Paint.Align.LEFT);
        if (ult == null) {
            p.setColor(sub);
            p.setTextSize(11f * d);
            c.drawText("Nessuna ricarica", r.left + 8f * d, r.centerY() + 4f * d, p);
            return;
        }
        float cy = r.centerY();
        p.setTypeface(Typeface.DEFAULT_BOLD);
        p.setColor(txt);
        p.setTextSize(11.5f * d);
        String luogo = ult.optString("luogo", "");
        String titolo = ult.optString("data", "") + (luogo.isEmpty() ? "" : " \u00B7 " + luogo);
        c.drawText(entra(p, titolo, maxW - 16f * d), r.left + 8f * d, cy - 2f * d, p);
        p.setTypeface(Typeface.DEFAULT);
        p.setColor(sub);
        p.setTextSize(10.5f * d);
        String dett = num(ult.optDouble("kwh", 0), 1) + " kWh \u00B7 " + eur(ult.optDouble("costo", 0))
                + " \u00B7 " + ult.optInt("prima", 0) + "\u2192" + ult.optInt("dopo", 0) + "%";
        c.drawText(entra(p, dett, maxW - 16f * d), r.left + 8f * d, cy + 12f * d, p);
    }
}
