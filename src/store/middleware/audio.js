/*
  * play sounds using the HTML5 AudioContext
  */


// iPhone needs this
const AudioContextConstructor = window.AudioContext
  || window.webkitAudioContext;
let context = null;
let lastPixelSoundAt = 0;
const previewEvents = {
  colorSelect: { type: 'SELECT_COLOR' },
  pixelPlacement: { type: 'REC_SET_PXLS', retCode: 0, pxlCnt: 1 },
  notification: { type: 'SET_NOTIFICATION', notification: 'preview' },
  captchaAlert: { type: 'ALERT', alertType: 'captcha' },
  infoAlert: { type: 'ALERT', alertType: 'info' },
  errorAlert: { type: 'ALERT', alertType: 'error' },
  stackFull: { type: 'PIXEL_STACK_EMPTY' },
  cooldownEnd: { type: 'COOLDOWN_END' },
  chatMessage: { type: 's/REC_CHAT_MESSAGE', notify: true },
};

function resumeAudioContext() {
  if (!context && AudioContextConstructor) {
    context = new AudioContextConstructor();
  }
  if (context?.state === 'suspended') {
    context.resume().catch((error) => {
      console.warn('Could not resume audio context:', error);
    });
  }
}

if (AudioContextConstructor) {
  window.addEventListener('pointerdown', resumeAudioContext, true);
  window.addEventListener('keydown', resumeAudioContext, true);
  window.addEventListener('touchstart', resumeAudioContext, true);
}

function connectAtVolume(gainNode, volume) {
  const volumeNode = context.createGain();
  volumeNode.gain.value = volume / 100;
  gainNode.connect(volumeNode);
  volumeNode.connect(context.destination);
}

export default (store) => (next) => (action) => {
  const state = store.getState();
  const {
    mute,
    chatNotify,
    audioVolume = 100,
    placementVolume = 100,
    alertVolume = 100,
    stackVolume = 100,
    chatVolume = 100,
  } = state.gui;
  const soundVolumes = state.gui.soundVolumes || {};
  const isPreview = action.type === 's/PREVIEW_SOUND';
  const soundAction = isPreview
    ? previewEvents[action.sound]
    : action;
  const volumeFor = (sound, fallback) => (
    audioVolume * (soundVolumes[sound] ?? fallback) / 100
  );

  if (!mute && context && soundAction) {
    switch (soundAction.type) {
      case 'SELECT_COLOR': {
        const oscillatorNode = context.createOscillator();
        const gainNode = context.createGain();
        const { currentTime } = context;

        oscillatorNode.type = 'sine';
        oscillatorNode.detune.value = -600;

        oscillatorNode.frequency.setValueAtTime(600, currentTime);
        oscillatorNode.frequency.setValueAtTime(700, currentTime + 0.1);


        gainNode.gain.setValueAtTime(0.3, currentTime);
        gainNode.gain.exponentialRampToValueAtTime(
          0.2,
          currentTime + 0.1,
        );

        oscillatorNode.connect(gainNode);
        connectAtVolume(gainNode, volumeFor('colorSelect', placementVolume));

        oscillatorNode.start();
        oscillatorNode.stop(currentTime + 0.2);
        break;
      }

      case 'SET_NOTIFICATION': {
        const { notification } = soundAction;
        if (typeof notification !== 'string') {
          break;
        }
        const oscillatorNode = context.createOscillator();
        const gainNode = context.createGain();
        const { currentTime } = context;

        oscillatorNode.type = 'sine';
        oscillatorNode.detune.value = -1200;

        oscillatorNode.frequency.setValueAtTime(500, currentTime);
        oscillatorNode.frequency.setValueAtTime(600, currentTime + 0.1);

        gainNode.gain.setValueAtTime(0.3, currentTime);
        gainNode.gain.exponentialRampToValueAtTime(
          0.2,
          currentTime + 0.1,
        );

        oscillatorNode.connect(gainNode);
        connectAtVolume(gainNode, volumeFor('notification', alertVolume));

        oscillatorNode.start();
        oscillatorNode.stop(currentTime + 0.2);
        break;
      }

      case 'ALERT': {
        const oscillatorNode = context.createOscillator();
        const gainNode = context.createGain();
        const { currentTime } = context;

        if (soundAction.alertType === 'captcha') {
          oscillatorNode.type = 'sine';
          oscillatorNode.detune.value = -600;
          oscillatorNode.start(currentTime);
          oscillatorNode.frequency.setValueAtTime(1479.98, currentTime);
          oscillatorNode.frequency.exponentialRampToValueAtTime(
            493.88,
            currentTime + 0.01,
          );
          oscillatorNode.stop(currentTime + 0.1);
          gainNode.gain.setValueAtTime(0.5, currentTime);
          gainNode.gain.setTargetAtTime(0, currentTime, 0.1);
          oscillatorNode.connect(gainNode);
          connectAtVolume(gainNode, volumeFor('captchaAlert', alertVolume));
        } else if (soundAction.alertType === 'info') {
          oscillatorNode.type = 'sine';
          oscillatorNode.detune.value = -500;
          oscillatorNode.start(currentTime);
          oscillatorNode.frequency.setValueAtTime(1000, currentTime);
          oscillatorNode.frequency.exponentialRampToValueAtTime(
            600,
            currentTime + 0.01,
          );
          oscillatorNode.stop(currentTime + 0.1);
          gainNode.gain.setValueAtTime(0.5, currentTime);
          gainNode.gain.setTargetAtTime(0, currentTime, 0.1);
          oscillatorNode.connect(gainNode);
          connectAtVolume(gainNode, volumeFor('infoAlert', alertVolume));
        } else {
          oscillatorNode.type = 'sine';
          oscillatorNode.detune.value = -900;
          oscillatorNode.start(currentTime);
          oscillatorNode.frequency.setValueAtTime(600, currentTime);
          oscillatorNode.frequency.setValueAtTime(
            1400,
            currentTime + 0.025,
          );
          oscillatorNode.frequency.setValueAtTime(
            1200,
            currentTime + 0.05,
          );
          oscillatorNode.frequency.setValueAtTime(
            900,
            currentTime + 0.075,
          );
          oscillatorNode.stop(currentTime + 0.3);
          const lfo = context.createOscillator();
          lfo.type = 'sine';
          lfo.start(currentTime);
          lfo.frequency.setValueAtTime(2.0, currentTime);
          lfo.stop(currentTime + 0.3);
          lfo.connect(gainNode);
          gainNode.gain.setValueAtTime(1.0, currentTime);
          gainNode.gain.setTargetAtTime(0, currentTime, 3);
          oscillatorNode.connect(gainNode);
          connectAtVolume(gainNode, volumeFor('errorAlert', placementVolume));
        }
        break;
      }

      case 'REC_SET_PXLS': {
        switch (soundAction.retCode) {
          case 0: {
            if (!soundAction.pxlCnt) {
              break;
            }
            const now = Date.now();
            if (!isPreview && now - lastPixelSoundAt < 100) {
              break;
            }
            lastPixelSoundAt = now;
            // successfully placed pixel
            const { palette, selectedColor: color } = state.canvas;
            const colorsAmount = palette.colors.length;

            const clrFreq = 100 + Math.log(color / colorsAmount + 1) * 300;
            const oscillatorNode = context.createOscillator();
            const gainNode = context.createGain();
            const { currentTime } = context;

            oscillatorNode.type = 'sine';
            oscillatorNode.start(currentTime);
            oscillatorNode.frequency.setValueAtTime(clrFreq, currentTime);
            oscillatorNode.frequency.exponentialRampToValueAtTime(
              1400,
              currentTime + 0.2,
            );
            oscillatorNode.stop(currentTime + 0.1);
            gainNode.gain.setValueAtTime(0.5, currentTime);
            gainNode.gain.setTargetAtTime(0, currentTime, 0.1);
            oscillatorNode.connect(gainNode);
            connectAtVolume(
              gainNode,
              volumeFor('pixelPlacement', placementVolume),
            );
            break;
          }
          default:
            // nothing
        }
        break;
      }

      case 'PIXEL_STACK_EMPTY': {
        const oscillatorNode = context.createOscillator();
        const gainNode = context.createGain();
        const { currentTime } = context;

        oscillatorNode.type = 'sine';
        oscillatorNode.start(currentTime);
        oscillatorNode.frequency.setValueAtTime(1479.98, currentTime);
        oscillatorNode.frequency.exponentialRampToValueAtTime(
          493.88,
          currentTime + 0.01,
        );
        oscillatorNode.stop(currentTime + 0.1);
        gainNode.gain.setValueAtTime(0.5, currentTime);
        gainNode.gain.setTargetAtTime(0, currentTime, 0.1);
        oscillatorNode.connect(gainNode);
        connectAtVolume(gainNode, volumeFor('stackFull', stackVolume));
        break;
      }

      case 'COOLDOWN_END': {
        // do not play sound if last cooldown end was <5s ago
        const { lastCoolDownEnd } = state.user;
        if (!isPreview
          && lastCoolDownEnd
          && lastCoolDownEnd + 5000 > Date.now()
        ) {
          break;
        }

        const oscillatorNode = context.createOscillator();
        const gainNode = context.createGain();
        const { currentTime } = context;

        oscillatorNode.type = 'sine';
        oscillatorNode.frequency.setValueAtTime(349.23, currentTime);
        oscillatorNode.frequency.setValueAtTime(
          523.25,
          currentTime + 0.1,
        );
        oscillatorNode.frequency.setValueAtTime(
          698.46,
          currentTime + 0.2,
        );

        gainNode.gain.setValueAtTime(0.5, currentTime);
        gainNode.gain.exponentialRampToValueAtTime(
          0.2,
          currentTime + 0.15,
        );

        oscillatorNode.connect(gainNode);
        connectAtVolume(gainNode, volumeFor('cooldownEnd', alertVolume));

        oscillatorNode.start();
        oscillatorNode.stop(currentTime + 0.3);
        break;
      }

      case 's/REC_CHAT_MESSAGE': {
        if (!isPreview && (!chatNotify || !soundAction.notify)) break;

        const oscillatorNode = context.createOscillator();
        const gainNode = context.createGain();
        const { currentTime } = context;

        oscillatorNode.type = 'sine';
        oscillatorNode.frequency.setValueAtTime(310, currentTime);
        oscillatorNode.frequency.exponentialRampToValueAtTime(
          355,
          currentTime + 0.025,
        );

        gainNode.gain.setValueAtTime(0.1, currentTime);
        gainNode.gain.exponentialRampToValueAtTime(
          0.1,
          currentTime + 0.1,
        );

        oscillatorNode.connect(gainNode);
        connectAtVolume(gainNode, volumeFor('chatMessage', chatVolume));

        oscillatorNode.start();
        oscillatorNode.stop(currentTime + 0.075);
        break;
      }

      default:
        // nothing
    }
  }

  return next(action);
};
