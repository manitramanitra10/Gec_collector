"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { CheckCircle2, Plus, ArrowLeft, PartyPopper } from "lucide-react"
import { Confetti } from "@/components/confetti"

export default function ThanksPage() {
  const [showConfetti, setShowConfetti] = useState(false)

  useEffect(() => {
    setShowConfetti(true)
  }, [])

  return (
    <div className="min-h-screen bg-background py-12">
      <Confetti active={showConfetti} />

      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/3 left-1/4 h-64 w-64 rounded-full bg-success/10 blur-3xl" />
        <div className="absolute top-1/2 right-1/4 h-48 w-48 rounded-full bg-primary/10 blur-3xl" />
      </div>

      <div className="relative mx-auto max-w-lg px-6">
        <Card className="border-border/50 text-center shadow-xl shadow-success/10">
          <CardHeader className="pb-2">
            <div className="mx-auto relative">
              <div className="absolute inset-0 animate-ping rounded-full bg-success/20" />
              <div className="relative flex h-20 w-20 items-center justify-center rounded-full bg-success/10">
                <CheckCircle2 className="h-10 w-10 text-success" />
              </div>
            </div>
            <div className="flex items-center justify-center gap-2 mt-6">
              <PartyPopper className="h-6 w-6 text-accent" />
              <CardTitle className="text-3xl font-bold">Merci !</CardTitle>
              <PartyPopper className="h-6 w-6 text-accent scale-x-[-1]" />
            </div>
            <CardDescription className="text-base mt-2">
              Votre contribution a ete enregistree avec succes. Elle sera examinee par la communaute.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 pt-6">
            <Button
              asChild
              className="gap-2 h-12 text-base shadow-lg shadow-primary/25 hover:shadow-primary/40 transition-shadow"
            >
              <Link href="/submit">
                <Plus className="h-5 w-5" />
                Soumettre un autre exemple
              </Link>
            </Button>
            <Button asChild variant="outline" className="gap-2 h-12 text-base bg-transparent">
              <Link href="/">
                <ArrowLeft className="h-5 w-5" />
                Retour a l'accueil
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
