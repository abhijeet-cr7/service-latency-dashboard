import { useCallback, useState } from 'react';
import { SimulatorPanel } from '../components/SimulatorPanel';
import { useLiveStreamContext } from '../hooks/useLiveStream';

export function LiveSimulator() {
  const { simulator } = useLiveStreamContext();
  const [rate, setRate] = useState(() => simulator?.getRate() ?? 0);

  const changeRate = useCallback(
    (r: number) => {
      simulator?.setRate(r);
      setRate(r);
    },
    [simulator],
  );
  const drop = useCallback(() => simulator?.dropConnection(), [simulator]);
  const stall = useCallback(() => simulator?.stall(), [simulator]);

  if (!simulator) return null;
  return <SimulatorPanel rate={rate} onRateChange={changeRate} onDrop={drop} onStall={stall} />;
}
