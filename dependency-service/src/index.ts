import pacote from 'pacote'
import graphviz from 'graphviz'
import dotenv from 'dotenv'
import * as Path from 'path'

dotenv.config()

class Node {
	constructor(
		public name: string,
		public version: string,
		public dependencies: Node[] = [],
	) {}
}

async function getDependencies(
	packageName: string,
	version: string = 'latest',
): Promise<Node> {
	const cache = new Map<string, Node>()

	async function traverse(
		packageName: string,
		version: string = 'latest',
	): Promise<Node> {
		const cacheKey = `${packageName}@${version}`

		if (cache.has(cacheKey)) return cache.get(cacheKey)!

		try {
			const manifest = await pacote.manifest(`${packageName}@${version}`)
			const node = new Node(packageName, manifest.version)

			cache.set(cacheKey, node)

			const dependencies = manifest.dependencies || {}
			node.dependencies = await Promise.all(
				Object.entries(dependencies).map(([name, version]) =>
					getDependencies(name, version),
				),
			)

			return node
		} catch (error) {
			console.error(`Ошибка для ${packageName}:`, error)
			return new Node(packageName, version)
		}
	}

	return traverse(packageName, version)
}

function generateGraph(node: Node): graphviz.Graph {
	const graph = graphviz.digraph('Dependencies')
	const visitedNodes = new Set<string>()

	function traverse(current: Node, parentNodeId: string | null = null) {
		const currentNodeId = `${current.name}\n${current.version}`

		graph.addNode(currentNodeId)
		visitedNodes.add(currentNodeId)

		const cacheKey = `${currentNodeId};${parentNodeId}`
		if (parentNodeId && !visitedNodes.has(cacheKey)) {
			graph.addEdge(parentNodeId, currentNodeId)
			visitedNodes.add(cacheKey)
		}

		current.dependencies.forEach(dependency => traverse(dependency, currentNodeId))
	}

	traverse(node)
	return graph
}

function saveGraph(graph: graphviz.Graph, fileName: string): void {
	if (!process.env.GraphVizPath) throw new Error('GraphVizPath not configured')

	graph.setGraphVizPath(process.env.GraphVizPath)
	graph.output('png', fileName)

	const fullPath = Path.resolve(process.cwd(), fileName)
	console.log('Граф сохранен по пути:', fullPath)
}

async function main() {
	if (!process.env.Dependency) throw new Error('dependency not configured')

	const dependencyGraph = await getDependencies(process.env.Dependency)

	const graph = generateGraph(dependencyGraph)

	saveGraph(graph, `${process.env.FileName || 'graph'}.png`)
}

main()
