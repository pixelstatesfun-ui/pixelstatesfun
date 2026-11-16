import { useState, useEffect } from 'preact/hooks';
import { memo } from 'preact/compat';
import { useSelector } from '../store/react-redux/index.js';


const NotifyBox = () => {
  const [className, setClassName] = useState('notifybox');
  const notification = useSelector((state) => state.user.notification);
  const hasNotification = notification !== null
    && notification !== undefined
    && notification !== '';

  useEffect(() => {
    if (hasNotification) {
      let newClassName = 'notifybox';
      if (typeof notification !== 'string') {
        if (notification >= 0) newClassName += ' green';
        else newClassName += ' red';
      }
      if (newClassName !== className) {
        setClassName(newClassName);
      }
    }
  }, [notification, hasNotification, className]);

  return (
    <div
      className={hasNotification ? `${className} show` : className}
    >
      {notification}
    </div>
  );
};

export default memo(NotifyBox);
