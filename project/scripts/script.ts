// Load in the required modules
import FaceGestures from 'FaceGestures';
import FaceTracking from 'FaceTracking';
import Patches from 'Patches';
import Materials from 'Materials';
import Textures from 'Textures';
import Reactive from 'Reactive';
import Diagnostics from 'Diagnostics';
import { randomInt } from 'crypto';


class Emojis<T>
{
  smile: T;
  surprised: T;
  kiss: T;
  frown: T;
  [key: string]: T;
}


(async function() {
  const face = FaceTracking.face(0);

  const observedStateSignals : Emojis<BoolSignal> = {
    smile: FaceGestures.isSmiling(face),
    surprised: FaceGestures.isSurprised(face),
    kiss: FaceGestures.isKissing(face),
    frown: FaceGestures.hasEyebrowsFrowned(face),
  };
  const stateKeys = Object.keys(observedStateSignals);

  let textures: Emojis<TextureBase>;
  let emojiMaterial: MaterialBase;
  {
    const textureKeys = stateKeys;
    const emojiMaterialKey = "emoji";
    const promises = [];
    {
      const t = Materials.findFirst(emojiMaterialKey);
      promises.push(t);
    }
    for (let key of textureKeys)
    {
      const t = Textures.findFirst(key);
      promises.push(t);
    }
    const objects = await Promise.all(promises);
    emojiMaterial = objects[0];

    {
      textures = new Emojis<TextureBase>();
      for (let i = 0; i < textureKeys.length; ++i)
      {
        const key = textureKeys[i];
        textures[key] = objects[i + 1];
      }
    }
  }

  const observedTimeoutMilliseconds : ScalarSignal = 
    await Patches.outputs.getScalar("observedTimeoutMilliseconds");

  const stateSignals = new Emojis<BoolSignalSource>();
  for (let key of stateKeys)
  {
    const signal = Reactive.boolSignalSource(key);
    stateSignals[key] = signal;

    const sourceSignal = observedStateSignals[key];
    signal.set(sourceSignal.pinLastValue());
  }

  // 
  for (var [key, signal] of Object.entries(observedStateSignals))
  {
    const copy = key;

    // No built-in debounce function? wth?
    let timeout : NodeJS.Timeout = null;
    signal
      .monitor()
      .subscribe(event => {
        if (timeout != null)
        {
          clearTimeout(timeout);
          timeout = null;
          return;
        }
        timeout = setTimeout(() => {
          stateSignals[copy].set(event.newValue);
          timeout = null;
        }, observedTimeoutMilliseconds.pinLastValue());
      });
  }

  const currentState = Reactive.stringSignalSource("currentState");
  {
    const randomKeyIndex = randomInt(0, stateKeys.length);
    const randomKey = stateKeys[randomKeyIndex];
    currentState.set(randomKey);
  }

  await Patches.inputs.setString("currentState", currentState.signal);

  const scoredTimeoutMilliseconds : ScalarSignal =
    await Patches.outputs.getScalar("scoredTimeoutMilliseconds"); 

  {
    let latestSubscription : Subscription = null;
    let stateSetTimeout : NodeJS.Timeout = null;
    currentState
      .signal
      .monitor({ fireOnInitialValue: true })
      .subscribe(async event => {
        const texture = textures[event.newValue];
        emojiMaterial.setTextureSlot("tex0", texture.signal);

        if (latestSubscription != null)
        {
          latestSubscription.unsubscribe();
        }

        const signal = stateSignals[event.newValue].signal;
        latestSubscription = signal
          .monitor({ fireOnInitialValue: true })
          .subscribe(event => {
            if (event.newValue == false)
            {
              if (stateSetTimeout != null)
                clearTimeout(stateSetTimeout);
            }
            else
            {
              stateSetTimeout = setTimeout(() => {
                // refresh the current state
                let currentRandomKey = currentState.signal.pinLastValue();
                let newRandomKey;
                do
                {
                  const randomKeyIndex = randomInt(0, stateKeys.length);
                  newRandomKey = stateKeys[randomKeyIndex];
                }
                while (currentRandomKey == newRandomKey);
                currentState.set(newRandomKey);

                stateSetTimeout = null;
              }, scoredTimeoutMilliseconds.pinLastValue());
            }
          });
      });
  }
})();