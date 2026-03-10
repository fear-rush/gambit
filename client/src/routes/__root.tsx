import { createRootRoute, Outlet } from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";
import { AggregatorProvider } from "../hooks/useAggregator";

export const Route = createRootRoute({
	component: () => (
		<AggregatorProvider>
			<Outlet />
			<TanStackRouterDevtools />
		</AggregatorProvider>
	),
});
