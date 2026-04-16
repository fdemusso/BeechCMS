import { useState } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { z } from 'zod'

import { fetchApi } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'

const formSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters.'),
  email: z.string().email('Invalid email address.'),
  subject: z.string().min(5, 'Subject must be at least 5 characters.'),
  message: z.string().min(10, 'Message must be at least 10 characters.'),
})

export default function Contact() {
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
      email: '',
      subject: '',
      message: '',
    },
  })

  async function onSubmit(values: z.infer<typeof formSchema>) {
    setStatus('submitting')
    setErrorMsg('')
    try {
      // Come verificato, l'API richiede l'involucro { "data": {...} } e status
      await fetchApi('/messaggi/add', {
        method: 'POST',
        body: JSON.stringify({
          status: 'draft',
          data: {
            name: values.name,
            email: values.email,
            subject: values.subject,
            message: values.message,
            read: false
          }
        }),
      })
      setStatus('success')
      form.reset()
    } catch (error: any) {
      console.error(error)
      setStatus('error')
      setErrorMsg(error.message || 'Failed to submit.')
    }
  }

  return (
    <div className="container px-4 py-16 mx-auto max-w-2xl">
      <div className="text-center mb-10 space-y-4">
        <h1 className="text-4xl font-extrabold tracking-tight lg:text-5xl">Contact Us</h1>
        <p className="text-muted-foreground text-lg">
          Please fill out the form below. It posts securely to the BeechCMS Public API.
        </p>
      </div>

      <div className="bg-card text-card-foreground border rounded-xl p-8 shadow-sm">
        {status === 'success' ? (
          <div className="text-center py-10 space-y-4">
            <h2 className="text-2xl font-bold text-green-500">Message Sent!</h2>
            <p className="text-muted-foreground">Thank you for reaching out. The backend recorded your message.</p>
            <Button onClick={() => setStatus('idle')} variant="outline">
              Send Another
            </Button>
          </div>
        ) : (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormControl>
                      <Input placeholder="John Doe" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input type="email" placeholder="john@example.com" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="subject"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Subject</FormLabel>
                    <FormControl>
                      <Input placeholder="DX Feedback" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="message"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Message</FormLabel>
                    <FormControl>
                      <Textarea 
                        placeholder="Tell us what you think..." 
                        className="resize-none min-h-[120px]" 
                        {...field} 
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {status === 'error' && (
                <div className="p-3 text-sm text-destructive bg-destructive/10 rounded-md">
                  Error: {errorMsg}
                </div>
              )}

              <Button type="submit" className="w-full" disabled={status === 'submitting'}>
                {status === 'submitting' ? 'Submitting...' : 'Send Message'}
              </Button>
            </form>
          </Form>
        )}
      </div>
    </div>
  )
}
