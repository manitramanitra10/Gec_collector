import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { FileText, CheckCircle, Download, ArrowRight, Sparkles, Zap, Users, PencilLine } from "lucide-react"

export default function Home() {
  return (
    <div className="min-h-screen bg-background">
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,_var(--tw-gradient-stops))] from-primary/20 via-accent/10 to-background" />
        <div className="absolute top-20 left-10 h-72 w-72 rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute top-40 right-10 h-64 w-64 rounded-full bg-accent/10 blur-3xl" />

        <div className="relative mx-auto max-w-5xl px-6 py-16 text-center sm:py-24">
          <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-4 py-1.5 text-sm font-medium text-primary mb-6">
            <Sparkles className="h-4 w-4" />
            Contribuez a l'IA
          </div>

          <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl md:text-6xl text-balance">
            GEC Data
            <span className="text-primary"> Collection</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground text-pretty leading-relaxed">
            Plateforme de collecte de paires de phrases pour l'entrainement de modeles de correction grammaticale.
            Chaque contribution compte !
          </p>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-6">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-success/10">
                <Zap className="h-4 w-4 text-success" />
              </div>
              <span>Rapide & Simple</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent/10">
                <Users className="h-4 w-4 text-accent" />
              </div>
              <span>Communautaire</span>
            </div>
          </div>

          <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
            <Button
              asChild
              size="lg"
              className="gap-2 shadow-lg shadow-primary/25 hover:shadow-primary/40 transition-shadow"
            >
              <Link href="/submit">
                Contribuer maintenant
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="bg-background/50 backdrop-blur">
              <Link href="/review">Valider des exemples</Link>
            </Button>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-5xl px-6 pb-16 sm:pb-24">
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          <Card className="group border-border/50 bg-card/80 backdrop-blur hover:shadow-lg hover:shadow-primary/5 transition-all duration-300 hover:-translate-y-1">
            <CardHeader>
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 group-hover:bg-primary/20 transition-colors">
                <FileText className="h-7 w-7 text-primary" />
              </div>
              <CardTitle className="mt-4 text-xl">Soumettre</CardTitle>
              <CardDescription className="text-base">
                Ajoutez des paires de phrases incorrectes et corrigées pour enrichir le corpus.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild variant="ghost" className="gap-2 px-0 text-primary hover:text-primary/80">
                <Link href="/submit">
                  Commencer
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                </Link>
              </Button>
            </CardContent>
          </Card>

          <Card className="group border-border/50 bg-card/80 backdrop-blur hover:shadow-lg hover:shadow-primary/5 transition-all duration-300 hover:-translate-y-1">
            <CardHeader>
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 group-hover:bg-primary/20 transition-colors">
                <PencilLine className="h-7 w-7 text-primary" />
              </div>
              <CardTitle className="mt-4 text-xl">Corriger</CardTitle>
              <CardDescription className="text-base">
                Relisez un par un les exemples importés et corrigez-les avant validation.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild variant="ghost" className="gap-2 px-0 text-primary hover:text-primary/80">
                <Link href="/correct">
                  Corriger
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                </Link>
              </Button>
            </CardContent>
          </Card>

          <Card className="group border-border/50 bg-card/80 backdrop-blur hover:shadow-lg hover:shadow-success/5 transition-all duration-300 hover:-translate-y-1">
            <CardHeader>
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-success/10 group-hover:bg-success/20 transition-colors">
                <CheckCircle className="h-7 w-7 text-success" />
              </div>
              <CardTitle className="mt-4 text-xl">Valider</CardTitle>
              <CardDescription className="text-base">
                Votez pour valider ou rejeter les exemples soumis par la communaute.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild variant="ghost" className="gap-2 px-0 text-success hover:text-success/80">
                <Link href="/review">
                  Voter
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                </Link>
              </Button>
            </CardContent>
          </Card>

          <Card className="group border-border/50 bg-card/80 backdrop-blur hover:shadow-lg hover:shadow-accent/5 transition-all duration-300 hover:-translate-y-1">
            <CardHeader>
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent/10 group-hover:bg-accent/20 transition-colors">
                <Download className="h-7 w-7 text-accent" />
              </div>
              <CardTitle className="mt-4 text-xl">Exporter</CardTitle>
              <CardDescription className="text-base">
                Telechargez le corpus valide au format JSON ou CSV.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild variant="ghost" className="gap-2 px-0 text-accent hover:text-accent/80">
                <Link href="/export">
                  Telecharger
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
