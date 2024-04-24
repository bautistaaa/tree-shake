import React from "react";
import { useMe } from "bautista";

// eslint-disable-next-line react-hooks/rules-of-hooks
const _x = useMe();

export const App = () => {
  // eslint-disable-next-line
  console.log(_x);
  return (
    <div>
      <div>help me</div>
    </div>
  );
};
