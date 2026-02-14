declare module "../../config/plans.yaml" {
  interface Plan {
    name: string;
    description: string;
    maxImages: number | null;
    generationsPerMonth: number | null;
    pricing?: {
      monthly?: { costSats: number };
      yearly?: { costSats: number };
    };
  }

  interface PlansConfig {
    oneTimeUpgrade: { costSats: number; description: string };
    plans: Record<string, Plan>;
  }

  const config: PlansConfig;
  export default config;
}
