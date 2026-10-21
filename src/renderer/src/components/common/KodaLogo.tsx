import kodaIcon from "../../assets/koda/koda-icon.svg";

function KodaLogo({ size = 32 }: { size?: number }): React.JSX.Element {
  return (
    <img
      src={kodaIcon}
      width={size}
      height={size}
      className="rounded-xl"
      alt="Koda"
    />
  );
}

export default KodaLogo;
