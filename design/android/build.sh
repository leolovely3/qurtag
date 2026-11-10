#!/bin/sh
# Renders the QuR Tag Android launcher icons, launch screen and Play Store icon from the same
# drawing as the iPhone icon: public/brand/qurtag-mark.svg (written by `npm run brand`,
# scripts/brand/build-brand.mjs), the letters QuR with the orange u and smile on near-black.
#
# - Adaptive icon (Android 8 and later): the near-black background (drawable/ic_launcher_background.xml)
#   and the letters alone as the foreground, scaled so they fill the same share of the visible
#   icon as on iPhone (70% of the width) and stay inside the safe zone every launcher mask keeps.
# - Legacy square and round icons (older launchers): the full mark, rounded or in a circle.
# - Launch screen for Android 11 and older (12 and later draw the system splash from styles.xml:
#   near-black with the letters): a centre crop of the iPhone splash.
# - icon-512.png for the Play Store (square, no transparency; Play rounds the corners).
#
# Needs rsvg-convert and ImageMagick (magick).   sh design/android/build.sh
set -e
cd "$(dirname "$0")"
MARK=../../public/brand/qurtag-mark.svg
SPLASH=../../ios/App/App/Assets.xcassets/Splash.imageset/splash-2732x2732.png
RES=../../android/app/src/main/res
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

# The full-bleed mark (the iPhone icon's look) and the letters on their own.
sed -E 's/rx="[0-9.]+"/rx="0"/' $MARK > $TMP/full.svg
# 0.6667 = (0.7 x 72 / 108) / 0.7: the visible part of an adaptive icon is 72 of its 108 units.
LETTERS=$(sed -E 's/.*<\/rect>|.*<rect[^>]*\/>//; s/<\/svg>.*//' $MARK)
printf '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512"><g transform="translate(85.33 85.33) scale(0.66667)">%s</g></svg>' "$LETTERS" > $TMP/fg.svg

rsvg-convert -w 1024 -h 1024 $TMP/full.svg -o $TMP/icon.png
rsvg-convert -w 1024 -h 1024 $TMP/fg.svg -o $TMP/fg.png

magick -size 1024x1024 xc:none -fill white -draw 'roundrectangle 0,0 1023,1023 184,184' $TMP/sqmask.png
magick -size 1024x1024 xc:none -fill white -draw 'circle 512,512 512,0' $TMP/circmask.png
magick $TMP/icon.png $TMP/sqmask.png -alpha off -compose CopyOpacity -composite $TMP/legacy.png
magick $TMP/icon.png $TMP/circmask.png -alpha off -compose CopyOpacity -composite $TMP/round.png

for d in mdpi:48:108 hdpi:72:162 xhdpi:96:216 xxhdpi:144:324 xxxhdpi:192:432; do
  n=${d%%:*}; rest=${d#*:}; s=${rest%%:*}; f=${rest#*:}
  mkdir -p $RES/mipmap-$n
  magick $TMP/legacy.png -resize ${s}x${s} $RES/mipmap-$n/ic_launcher.png
  magick $TMP/round.png -resize ${s}x${s} $RES/mipmap-$n/ic_launcher_round.png
  magick $TMP/fg.png -resize ${f}x${f} $RES/mipmap-$n/ic_launcher_foreground.png
done

for d in port-mdpi:320x480 port-hdpi:480x800 port-xhdpi:720x1280 port-xxhdpi:960x1600 port-xxxhdpi:1280x1920 \
         land-mdpi:480x320 land-hdpi:800x480 land-xhdpi:1280x720 land-xxhdpi:1600x960 land-xxxhdpi:1920x1280; do
  n=${d%%:*}; sz=${d#*:}
  mkdir -p $RES/drawable-$n
  magick $SPLASH -resize "${sz}^" -gravity center -extent $sz -alpha off PNG24:$RES/drawable-$n/splash.png
done
magick $SPLASH -resize "480x320^" -gravity center -extent 480x320 -alpha off PNG24:$RES/drawable/splash.png

magick $TMP/icon.png -resize 512x512 -alpha off PNG24:icon-512.png
rsvg-convert -w 1024 -h 500 feature-graphic.svg -o $TMP/fgfx.png
magick $TMP/fgfx.png -alpha off PNG24:feature-graphic-1024x500.png
echo "Android icons and launch screens written to $RES"
